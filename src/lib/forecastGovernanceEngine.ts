import prisma from '@/lib/prisma';

export interface DiffResult {
  batchId: string;
  batchCode: string;
  previousVersionId?: string;
  currentVersionId: string;
  totalProcessed: number;
  rolesAnalyzed: number;
  unchangedCount: number;
  diffCount: number;
  additionsCount: number;
  withdrawalsCount: number;
  newRolesCount: number;
  removedRolesCount: number;
  netDelta: number;
  pendingJustificationCount: number;
}

export async function generateBatchCode(): Promise<string> {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const datePrefix = `FORECAST-${yyyy}${mm}${dd}`;

  const countToday = await prisma.forecastImportBatch.count({
    where: {
      batchCode: {
        startsWith: datePrefix,
      },
    },
  });

  const seq = String(countToday + 1).padStart(3, '0');
  return `${datePrefix}-${seq}`;
}

export async function processForecastVersionComparison({
  year,
  newVersionId,
  batchId,
  userId,
}: {
  year: number;
  newVersionId: string;
  batchId: string;
  userId: string;
}): Promise<DiffResult> {
  // 1. Find the previous Forecast version (excluding current newVersionId)
  const previousVersions = await prisma.planVersion.findMany({
    where: {
      year,
      type: 'FORECAST',
      id: { not: newVersionId },
    },
    orderBy: { createdAt: 'desc' },
  });

  const previousForecastVersion = previousVersions[0] || null;

  // 2. Fetch PA version for baseline reference
  const paVersion = await prisma.planVersion.findFirst({
    where: { year, type: 'PA' },
    orderBy: { createdAt: 'desc' },
  });

  // 3. Load all PlanRecords for New Forecast Version
  const newForecastRecords = await prisma.planRecord.findMany({
    where: { versionId: newVersionId },
    include: {
      costCenter: {
        include: {
          operation: {
            include: { contract: true },
          },
        },
      },
      role: true,
    },
  });

  // 4. Load all PlanRecords for Previous Forecast Version (if any)
  const previousForecastRecords = previousForecastVersion
    ? await prisma.planRecord.findMany({
        where: { versionId: previousForecastVersion.id },
      })
    : [];

  // 5. Load all PlanRecords for PA Version (if any)
  const paRecords = paVersion
    ? await prisma.planRecord.findMany({
        where: { versionId: paVersion.id },
      })
    : [];

  // Index maps: key = `${competence}__${costCenterId}__${roleId}`
  const getKey = (comp: string, ccId: string, rId: string) => `${comp}__${ccId}__${rId}`;

  const prevMap = new Map<string, number>();
  previousForecastRecords.forEach((r) => {
    const val = r.adjustedFte !== null && r.adjustedFte !== undefined ? r.adjustedFte : r.plannedFte;
    prevMap.set(getKey(r.competence, r.costCenterId, r.roleId), val);
  });

  const paMap = new Map<string, number>();
  paRecords.forEach((r) => {
    paMap.set(getKey(r.competence, r.costCenterId, r.roleId), r.plannedFte);
  });

  // Also collect all unique keys across New and Previous Forecast
  const allKeys = new Map<
    string,
    {
      competence: string;
      costCenterId: string;
      contractId: string;
      roleId: string;
      newVal: number;
    }
  >();

  newForecastRecords.forEach((r) => {
    const contractId = r.costCenter.operation.contract.id;
    const key = getKey(r.competence, r.costCenterId, r.roleId);
    const val = r.adjustedFte !== null && r.adjustedFte !== undefined ? r.adjustedFte : r.plannedFte;
    allKeys.set(key, {
      competence: r.competence,
      costCenterId: r.costCenterId,
      contractId,
      roleId: r.roleId,
      newVal: val,
    });
  });

  // If a role existed in Previous Forecast but is NOT in the new Forecast, it means it became 0 (Excluded)
  if (previousForecastVersion) {
    for (const prevRec of previousForecastRecords) {
      const key = getKey(prevRec.competence, prevRec.costCenterId, prevRec.roleId);
      if (!allKeys.has(key)) {
        const cc = await prisma.costCenter.findUnique({
          where: { id: prevRec.costCenterId },
          include: { operation: { include: { contract: true } } },
        });
        if (cc && cc.operation?.contract) {
          allKeys.set(key, {
            competence: prevRec.competence,
            costCenterId: prevRec.costCenterId,
            contractId: cc.operation.contract.id,
            roleId: prevRec.roleId,
            newVal: 0,
          });
        }
      }
    }
  }

  let unchangedCount = 0;
  let diffCount = 0;
  let additionsCount = 0;
  let withdrawalsCount = 0;
  let newRolesCount = 0;
  let removedRolesCount = 0;
  let netDelta = 0;
  let pendingJustificationCount = 0;

  const governanceRecordsToCreate: any[] = [];

  for (const [key, item] of allKeys.entries()) {
    const paVal = paMap.get(key) ?? 0;

    let prevVal: number;
    if (previousForecastVersion) {
      prevVal = prevMap.get(key) ?? 0;
    } else {
      prevVal = paVal;
    }

    const currentVal = item.newVal;
    const delta = currentVal - prevVal;

    // Rule: PA = Forecast or Prev = Current -> NO GOVERNANCE
    if (Math.abs(delta) < 0.0001) {
      unchangedCount++;
      continue;
    }

    diffCount++;
    netDelta += delta;

    let type: 'ACRESCIMO' | 'RETIRADA' = delta > 0 ? 'ACRESCIMO' : 'RETIRADA';
    const movedQty = Math.abs(delta);

    const isNewRole = prevVal === 0 && currentVal > 0;
    const isRemovedRole = prevVal > 0 && currentVal === 0;

    if (delta > 0) {
      additionsCount++;
      if (isNewRole) newRolesCount++;
    } else {
      withdrawalsCount++;
      if (isRemovedRole) removedRolesCount++;
    }

    pendingJustificationCount++;

    governanceRecordsToCreate.push({
      competence: item.competence,
      contractId: item.contractId,
      costCenterId: item.costCenterId,
      roleId: item.roleId,
      type,
      previousQuantity: prevVal,
      movedQuantity: movedQty,
      finalQuantity: currentVal,
      justification: 'Pendente de justificativa (Upload Massivo)',
      status: 'PENDENTE',
      origin: 'UPLOAD_FORECAST',
      justificationStatus: 'PENDENTE',
      batchId,
      previousVersionId: previousForecastVersion?.id || null,
      currentVersionId: newVersionId,
      paQuantity: paVal,
      previousForecastQuantity: prevVal,
      currentForecastQuantity: currentVal,
      deltaQuantity: delta,
      isNewRole,
      isRemovedRole,
      requesterId: userId,
      hasEvidence: false,
    });
  }

  // Insert governance records in chunks
  const chunkSize = 200;
  for (let i = 0; i < governanceRecordsToCreate.length; i += chunkSize) {
    const chunk = governanceRecordsToCreate.slice(i, i + chunkSize);
    await prisma.governanceRecord.createMany({
      data: chunk,
    });
  }

  // Update batch metrics
  const batch = await prisma.forecastImportBatch.update({
    where: { id: batchId },
    data: {
      totalProcessed: allKeys.size,
      rolesAnalyzed: allKeys.size,
      unchangedCount,
      diffCount,
      additionsCount,
      withdrawalsCount,
      newRolesCount,
      removedRolesCount,
      netDelta,
      pendingJustificationCount,
    },
  });

  return {
    batchId: batch.id,
    batchCode: batch.batchCode,
    previousVersionId: previousForecastVersion?.id,
    currentVersionId: newVersionId,
    totalProcessed: allKeys.size,
    rolesAnalyzed: allKeys.size,
    unchangedCount,
    diffCount,
    additionsCount,
    withdrawalsCount,
    newRolesCount,
    removedRolesCount,
    netDelta,
    pendingJustificationCount,
  };
}
