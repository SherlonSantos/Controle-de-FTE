import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { extractLocation, sortCompetences } from '@/lib/locationHelper';
import { isDemobilized } from '@/lib/demobilizationHelper';

export const runtime = 'nodejs';

function normalizeText(s: string) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isSubtotalRole(ccCode: string, ccDesc: string, roleTitle: string) {
  const roleClean = normalizeText(roleTitle);
  const ccCodeClean = normalizeText(ccCode);
  const ccDescFullClean = normalizeText(`${ccCode} - ${ccDesc}`);
  const ccDescClean = normalizeText(ccDesc);
  return roleClean === ccCodeClean || roleClean === ccDescFullClean || roleClean === ccDescClean;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      competence: reqCompetence,
      contracts = [],
      locations = [],
      costCenters = [],
      roles = [],
      historicalMonths = 12
    } = body;

    // 1. Identify distinct active competences
    const distinctActiveComps = await prisma.activeList.findMany({
      select: { competence: true },
      distinct: ['competence']
    });
    const activeCompetences = sortCompetences(distinctActiveComps.map(c => c.competence).filter(Boolean));

    // Reference competence defaults to latest active competence
    const selectedCompetence = reqCompetence && reqCompetence.trim()
      ? reqCompetence.trim()
      : (activeCompetences.length > 0 ? activeCompetences[activeCompetences.length - 1] : '09/2026');

    // Find previous competence for MoM analysis
    const selectedCompIdx = activeCompetences.indexOf(selectedCompetence);
    const previousCompetence = selectedCompIdx > 0 ? activeCompetences[selectedCompIdx - 1] : null;

    const [compMonthStr, compYearStr] = selectedCompetence.split('/');
    const yearInt = parseInt(compYearStr || '2026', 10);

    // 2. Build Cost Center filter
    const ccFilter: any = {};
    if (costCenters.length > 0) {
      ccFilter.id = { in: costCenters };
    }
    if (contracts.length > 0) {
      ccFilter.operation = { contract: { name: { in: contracts } } };
    }

    // 3. Fetch Plan Versions (PA and FORECAST for reference year)
    const [paVersion, forecastVersion] = await Promise.all([
      prisma.planVersion.findFirst({
        where: { year: yearInt, type: 'PA' },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.planVersion.findFirst({
        where: { year: yearInt, type: 'FORECAST' },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // 4. Concurrently query records for selected competence, previous competence, and governance
    const [
      paRecords,
      forecastRecords,
      activeRecords,
      prevActiveRecords,
      governanceRecords
    ] = await Promise.all([
      paVersion
        ? prisma.planRecord.findMany({
            where: {
              versionId: paVersion.id,
              competence: selectedCompetence,
              ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
            },
            include: {
              costCenter: { include: { operation: { include: { contract: true } } } },
              role: true
            }
          })
        : [],
      forecastVersion
        ? prisma.planRecord.findMany({
            where: {
              versionId: forecastVersion.id,
              competence: selectedCompetence,
              ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
            },
            include: {
              costCenter: { include: { operation: { include: { contract: true } } } },
              role: true
            }
          })
        : [],
      prisma.activeList.findMany({
        where: {
          competence: selectedCompetence,
          status: { not: 'Rescisão' },
          ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
        },
        include: {
          costCenter: { include: { operation: { include: { contract: true } } } },
          role: true
        }
      }),
      previousCompetence
        ? prisma.activeList.findMany({
            where: {
              competence: previousCompetence,
              status: { not: 'Rescisão' },
              ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
            },
            include: {
              costCenter: { include: { operation: { include: { contract: true } } } },
              role: true
            }
          })
        : [],
      prisma.governanceRecord.findMany({
        where: { competence: selectedCompetence },
        include: {
          contract: true,
          costCenter: true,
          role: true,
          requester: true,
          approver: true,
          evidences: true
        }
      })
    ]);

    // 5. Build Aggregation Tree: Contrato (L1) -> Localidade (L2) -> Cargo (L3)
    type RoleItem = {
      roleId: string;
      roleTitle: string;
      pa: number;
      forecast: number;
      realizado: number;
      difFTE: number;
      pctDif: number | null;
      justification?: string | null;
      responsible?: string | null;
      governanceStatus?: string | null;
      governanceOrigin?: string | null;
      evidence?: any | null;
    };

    type LocationItem = {
      locationName: string;
      costCenterCode: string;
      costCenterDesc: string;
      costCenterId: string;
      pa: number;
      forecast: number;
      realizado: number;
      difFTE: number;
      pctDif: number | null;
      roles: Map<string, RoleItem>;
    };

    type ContractItem = {
      contractId: string;
      contractName: string;
      pa: number;
      forecast: number;
      realizado: number;
      difFTE: number;
      pctDif: number | null;
      hasZeroPA: boolean;
      locations: Map<string, LocationItem>;
    };

    const contractsMap = new Map<string, ContractItem>();

    const getContractNode = (cName: string, cId: string) => {
      if (!contractsMap.has(cName)) {
        contractsMap.set(cName, {
          contractId: cId || '',
          contractName: cName,
          pa: 0,
          forecast: 0,
          realizado: 0,
          difFTE: 0,
          pctDif: 0,
          hasZeroPA: false,
          locations: new Map()
        });
      }
      return contractsMap.get(cName)!;
    };

    const getLocationNode = (contractNode: ContractItem, cc: any) => {
      const ccCode = cc.code || '';
      const ccDesc = cc.description || '';
      const locName = extractLocation(ccDesc, ccCode);
      const locKey = `${cc.id || ccCode}`;

      if (!contractNode.locations.has(locKey)) {
        contractNode.locations.set(locKey, {
          locationName: locName,
          costCenterCode: ccCode,
          costCenterDesc: ccDesc,
          costCenterId: cc.id || '',
          pa: 0,
          forecast: 0,
          realizado: 0,
          difFTE: 0,
          pctDif: 0,
          roles: new Map()
        });
      }
      return contractNode.locations.get(locKey)!;
    };

    const getRoleNode = (locNode: LocationItem, role: any) => {
      const roleId = role?.id || 'unknown';
      const roleTitle = role?.title || 'Não informado';

      if (!locNode.roles.has(roleId)) {
        locNode.roles.set(roleId, {
          roleId,
          roleTitle,
          pa: 0,
          forecast: 0,
          realizado: 0,
          difFTE: 0,
          pctDif: 0,
          justification: null,
          responsible: null,
          governanceStatus: null,
          governanceOrigin: null,
          evidence: null
        });
      }
      return locNode.roles.get(roleId)!;
    };

    // Populate PA
    for (const item of paRecords) {
      if (!item.costCenter) continue;
      if (isDemobilized(selectedCompetence, item.costCenter.operation?.contract?.demobilizationDate)) continue;
      const cName = item.costCenter.operation?.contract?.name || 'Sem Contrato';
      const cId = item.costCenter.operation?.contract?.id || '';
      const ccCode = item.costCenter.code || '';
      const ccDesc = item.costCenter.description || '';
      const roleTitle = item.role?.title || '';

      if (isSubtotalRole(ccCode, ccDesc, roleTitle)) continue;

      const locName = extractLocation(ccDesc, ccCode);
      if (locations.length > 0 && !locations.includes(locName)) continue;
      if (roles.length > 0 && !roles.includes(roleTitle)) continue;

      const contractNode = getContractNode(cName, cId);
      const locNode = getLocationNode(contractNode, item.costCenter);
      const roleNode = getRoleNode(locNode, item.role);

      const val = item.plannedFte || 0;
      roleNode.pa += val;
      locNode.pa += val;
      contractNode.pa += val;
    }

    // Populate Forecast
    for (const item of forecastRecords) {
      if (!item.costCenter) continue;
      if (isDemobilized(selectedCompetence, item.costCenter.operation?.contract?.demobilizationDate)) continue;
      const cName = item.costCenter.operation?.contract?.name || 'Sem Contrato';
      const cId = item.costCenter.operation?.contract?.id || '';
      const ccCode = item.costCenter.code || '';
      const ccDesc = item.costCenter.description || '';
      const roleTitle = item.role?.title || '';

      if (isSubtotalRole(ccCode, ccDesc, roleTitle)) continue;

      const locName = extractLocation(ccDesc, ccCode);
      if (locations.length > 0 && !locations.includes(locName)) continue;
      if (roles.length > 0 && !roles.includes(roleTitle)) continue;

      const contractNode = getContractNode(cName, cId);
      const locNode = getLocationNode(contractNode, item.costCenter);
      const roleNode = getRoleNode(locNode, item.role);

      const val = item.adjustedFte !== null ? item.adjustedFte : item.plannedFte;
      roleNode.forecast += val || 0;
      locNode.forecast += val || 0;
      contractNode.forecast += val || 0;

      if (item.justification && !roleNode.justification) {
        roleNode.justification = item.justification;
        roleNode.governanceOrigin = 'Upload Forecast';
      }
    }

    // Populate Realizado
    for (const item of activeRecords) {
      if (!item.costCenter) continue;
      if (isDemobilized(selectedCompetence, item.costCenter.operation?.contract?.demobilizationDate)) continue;
      const cName = item.costCenter.operation?.contract?.name || 'Sem Contrato';
      const cId = item.costCenter.operation?.contract?.id || '';
      const ccCode = item.costCenter.code || '';
      const ccDesc = item.costCenter.description || '';
      const roleTitle = item.role?.title || '';

      if (isSubtotalRole(ccCode, ccDesc, roleTitle)) continue;

      const locName = extractLocation(ccDesc, ccCode);
      if (locations.length > 0 && !locations.includes(locName)) continue;
      if (roles.length > 0 && !roles.includes(roleTitle)) continue;

      const contractNode = getContractNode(cName, cId);
      const locNode = getLocationNode(contractNode, item.costCenter);
      const roleNode = getRoleNode(locNode, item.role);

      const val = item.fteValue || 1.0;
      roleNode.realizado += val;
      locNode.realizado += val;
      contractNode.realizado += val;
    }

    // Match Governance Records to Roles
    for (const contractNode of contractsMap.values()) {
      for (const locNode of contractNode.locations.values()) {
        for (const roleNode of locNode.roles.values()) {
          const matchedGov = governanceRecords.find(g => {
            const contractMatch = g.contractId === contractNode.contractId || (g.contract && g.contract.name === contractNode.contractName);
            const roleMatch = g.roleId === roleNode.roleId || (g.role && g.role.title === roleNode.roleTitle);
            const ccMatch = !g.costCenterId || g.costCenterId === locNode.costCenterId;
            return contractMatch && roleMatch && ccMatch;
          });

          if (matchedGov) {
            roleNode.justification = matchedGov.justification || roleNode.justification;
            roleNode.responsible = matchedGov.approver?.name || matchedGov.requester?.name || 'Gestor Autorizado';
            roleNode.governanceStatus = matchedGov.status || 'APROVADO';
            roleNode.governanceOrigin = 'Manual Governança';
            if (matchedGov.evidences && matchedGov.evidences.length > 0) {
              roleNode.evidence = {
                id: matchedGov.evidences[0].id,
                fileName: matchedGov.evidences[0].fileName,
                filePath: matchedGov.evidences[0].filePath,
                fileType: matchedGov.evidences[0].fileType
              };
            }
          }
        }
      }
    }

    // 6. Calculate Differences and Percentages across all levels
    let grandTotalPA = 0;
    let grandTotalFC = 0;
    let grandTotalReal = 0;

    const formattedContracts: any[] = [];

    for (const c of contractsMap.values()) {
      // Skip empty ghost contracts
      if (c.pa === 0 && c.forecast === 0 && c.realizado === 0) continue;

      grandTotalPA += c.pa;
      grandTotalFC += c.forecast;
      grandTotalReal += c.realizado;

      c.difFTE = c.realizado - c.pa;
      c.hasZeroPA = c.pa === 0;
      c.pctDif = c.pa > 0 ? ((c.realizado - c.pa) / c.pa) * 100 : (c.realizado > 0 ? 100 : 0);

      const locationsArray: any[] = [];
      for (const loc of c.locations.values()) {
        if (loc.pa === 0 && loc.forecast === 0 && loc.realizado === 0) continue;

        loc.difFTE = loc.realizado - loc.pa;
        loc.pctDif = loc.pa > 0 ? ((loc.realizado - loc.pa) / loc.pa) * 100 : (loc.realizado > 0 ? 100 : 0);

        const rolesArray: any[] = [];
        for (const r of loc.roles.values()) {
          if (r.pa === 0 && r.forecast === 0 && r.realizado === 0) continue;
          r.difFTE = r.realizado - r.pa;
          r.pctDif = r.pa > 0 ? ((r.realizado - r.pa) / r.pa) * 100 : (r.realizado > 0 ? 100 : 0);
          rolesArray.push(r);
        }

        rolesArray.sort((a, b) => Math.abs(b.difFTE) - Math.abs(a.difFTE));

        locationsArray.push({
          locationName: loc.locationName,
          costCenterCode: loc.costCenterCode,
          costCenterDesc: loc.costCenterDesc,
          costCenterId: loc.costCenterId,
          pa: loc.pa,
          forecast: loc.forecast,
          realizado: loc.realizado,
          difFTE: loc.difFTE,
          pctDif: loc.pctDif !== null ? Math.round(loc.pctDif * 100) / 100 : null,
          hasZeroPA: loc.pa === 0,
          roles: rolesArray
        });
      }

      locationsArray.sort((a, b) => Math.abs(b.difFTE) - Math.abs(a.difFTE));

      formattedContracts.push({
        contractId: c.contractId,
        contractName: c.contractName,
        pa: c.pa,
        forecast: c.forecast,
        realizado: c.realizado,
        difFTE: c.difFTE,
        pctDif: c.pctDif !== null ? Math.round(c.pctDif * 100) / 100 : null,
        hasZeroPA: c.hasZeroPA,
        locations: locationsArray
      });
    }

    // 7. Generate TOP 10 Rankings
    // Table A - TOP 10 Maiores Desvios (Realizado > PA)
    // Priority: Positive % deviation descending, then positive absolute difFTE
    const topMaioresDesvios = [...formattedContracts]
      .filter(c => c.difFTE > 0)
      .sort((a, b) => {
        // If one has zero PA and positive real, order sensibly
        if (a.hasZeroPA && !b.hasZeroPA) return 1; // Real with valid PA usually first, or vice-versa
        if (!a.hasZeroPA && b.hasZeroPA) return -1;
        return (b.pctDif || 0) - (a.pctDif || 0) || b.difFTE - a.difFTE;
      })
      .slice(0, 10)
      .map((c, index) => ({
        ...c,
        rank: index + 1
      }));

    // Table B - TOP 10 Menores Desvios (Realizado < PA)
    // Priority: Negative % deviation ascending (most negative first), then most negative difFTE
    const topMenoresDesvios = [...formattedContracts]
      .filter(c => c.difFTE < 0)
      .sort((a, b) => (a.pctDif || 0) - (b.pctDif || 0) || a.difFTE - b.difFTE)
      .slice(0, 10)
      .map((c, index) => ({
        ...c,
        rank: index + 1
      }));

    // 8. Overall KPI Cards
    const difPA = grandTotalReal - grandTotalPA;
    const difForecast = grandTotalReal - grandTotalFC;
    const pctPA = grandTotalPA > 0 ? ((grandTotalReal - grandTotalPA) / grandTotalPA) * 100 : null;
    const pctForecast = grandTotalFC > 0 ? ((grandTotalReal - grandTotalFC) / grandTotalFC) * 100 : null;

    // 9. Complementary Executive Indicators
    const totalEvaluatedContracts = formattedContracts.length;
    const abovePAContracts = formattedContracts.filter(c => c.difFTE > 0);
    const onLimitPAContracts = formattedContracts.filter(c => c.difFTE === 0);
    const belowPAContracts = formattedContracts.filter(c => c.difFTE < 0);

    const positiveExcessoSum = abovePAContracts.reduce((acc, c) => acc + c.difFTE, 0);
    const negativeDeficitSum = belowPAContracts.reduce((acc, c) => acc + c.difFTE, 0);

    // Month-over-Month variation (MoM)
    let prevRealTotal = 0;
    if (prevActiveRecords.length > 0) {
      for (const item of prevActiveRecords) {
        if (!item.costCenter) continue;
        if (previousCompetence && isDemobilized(previousCompetence, item.costCenter.operation?.contract?.demobilizationDate)) continue;
        const ccCode = item.costCenter.code || '';
        const ccDesc = item.costCenter.description || '';
        const roleTitle = item.role?.title || '';
        if (isSubtotalRole(ccCode, ccDesc, roleTitle)) continue;

        const locName = extractLocation(ccDesc, ccCode);
        if (locations.length > 0 && !locations.includes(locName)) continue;
        if (roles.length > 0 && !roles.includes(roleTitle)) continue;

        prevRealTotal += item.fteValue || 1.0;
      }
    }

    const momDiff = previousCompetence ? grandTotalReal - prevRealTotal : 0;
    const momPct = previousCompetence && prevRealTotal > 0 ? ((grandTotalReal - prevRealTotal) / prevRealTotal) * 100 : 0;

    // Margins for Vacancies
    const margemTotalPA = Math.max(0, grandTotalPA - grandTotalReal);
    const margemTotalForecast = Math.max(0, grandTotalFC - grandTotalReal);
    const capacidadeNovasVagas = Math.max(0, Math.min(grandTotalPA - grandTotalReal, grandTotalFC - grandTotalReal));

    const contratosComMargem = formattedContracts.filter(c => c.realizado < c.pa && c.realizado < c.forecast).length;
    const contratosRequerAnalise = formattedContracts.filter(c => (c.realizado < c.pa && c.realizado >= c.forecast) || (c.realizado >= c.pa && c.realizado < c.forecast)).length;
    const contratosSemMargem = formattedContracts.filter(c => c.realizado >= c.pa && c.realizado >= c.forecast).length;

    // 10. Historical Evolution Chart (PA x Realizado)
    // Gather all 12 competences for the year
    const allMonths = [
      `01/${yearInt}`, `02/${yearInt}`, `03/${yearInt}`, `04/${yearInt}`,
      `05/${yearInt}`, `06/${yearInt}`, `07/${yearInt}`, `08/${yearInt}`,
      `09/${yearInt}`, `10/${yearInt}`, `11/${yearInt}`, `12/${yearInt}`
    ];

    // Financial calculations by competence (matching dashboard rules)
    const hasFilter = Object.keys(ccFilter).length > 0;
    let validCCs: string[] = [];
    let validCCodes: string[] = [];
    if (hasFilter) {
      const validCostCenters = await prisma.costCenter.findMany({ where: ccFilter, select: { id: true, code: true } });
      validCCs = validCostCenters.map(c => c.id);
      validCCodes = validCostCenters.map(c => c.code);
    }

    const ccCondition = hasFilter && validCCs.length > 0
      ? Prisma.sql`AND cc.id IN (${Prisma.join(validCCs)})`
      : hasFilter
        ? Prisma.sql`AND 1=0`
        : Prisma.empty;

    // High performance SQL GROUP BY for historical evolution FTE (excluding demobilized contracts per month) + Financial records
    const [paGrouped, fcGrouped, actGrouped, variacaoRecords] = await Promise.all([
      paVersion
        ? prisma.$queryRaw<Array<{ competence: string; pa: number }>>`
            SELECT p.competence, SUM(COALESCE(p."plannedFte", 0))::float as pa
            FROM "PlanRecord" p
            JOIN "CostCenter" cc ON p."costCenterId" = cc.id
            LEFT JOIN "Operation" op ON cc."operationId" = op.id
            LEFT JOIN "Contract" c ON op."contractId" = c.id
            WHERE p."versionId" = ${paVersion.id}
              ${ccCondition}
              AND (
                c."demobilizationDate" IS NULL 
                OR to_date(p.competence, 'MM/YYYY') < date_trunc('month', c."demobilizationDate")
              )
            GROUP BY p.competence
          `
        : Promise.resolve([]),
      forecastVersion
        ? prisma.$queryRaw<Array<{ competence: string; forecast: number }>>`
            SELECT p.competence, SUM(COALESCE(p."adjustedFte", p."plannedFte", 0))::float as forecast
            FROM "PlanRecord" p
            JOIN "CostCenter" cc ON p."costCenterId" = cc.id
            LEFT JOIN "Operation" op ON cc."operationId" = op.id
            LEFT JOIN "Contract" c ON op."contractId" = c.id
            WHERE p."versionId" = ${forecastVersion.id}
              ${ccCondition}
              AND (
                c."demobilizationDate" IS NULL 
                OR to_date(p.competence, 'MM/YYYY') < date_trunc('month', c."demobilizationDate")
              )
            GROUP BY p.competence
          `
        : Promise.resolve([]),
      prisma.$queryRaw<Array<{ competence: string; realizado: number }>>`
        SELECT a.competence, SUM(COALESCE(a."fteValue", 1.0))::float as realizado
        FROM "ActiveList" a
        JOIN "CostCenter" cc ON a."costCenterId" = cc.id
        LEFT JOIN "Operation" op ON cc."operationId" = op.id
        LEFT JOIN "Contract" c ON op."contractId" = c.id
        WHERE a.status != 'Rescisão'
          ${ccCondition}
          AND (
            c."demobilizationDate" IS NULL 
            OR to_date(a.competence, 'MM/YYYY') < date_trunc('month', c."demobilizationDate")
          )
        GROUP BY a.competence
      `,
      prisma.variacaoRecord.findMany({
        where: { competence: { in: allMonths } },
        include: { costCenter: { include: { operation: { include: { contract: true } } } } }
      })
    ]);

    const financialByComp = new Map<string, { valPa: number; valReal: number }>();
    allMonths.forEach(m => financialByComp.set(m, { valPa: 0, valReal: 0 }));

    for (const record of variacaoRecords) {
      if (isDemobilized(record.competence, record.costCenter?.operation?.contract?.demobilizationDate)) {
        continue;
      }
      let prefix = "";
      if (record.contractName) {
        prefix = record.contractName.split('-')[0].replace(/\./g, '').trim().substring(0, 6);
      }
      if (!prefix && record.costCenter) {
        prefix = record.costCenter.code.substring(0, 6);
      }
      if (!prefix) continue;

      if (hasFilter && !validCCodes.some(code => code.startsWith(prefix))) {
        continue;
      }

      const comp = record.competence?.trim();
      if (comp && financialByComp.has(comp)) {
        const item = financialByComp.get(comp)!;
        item.valPa += Number(record.valPa) || 0;
        item.valReal += Number(record.valReal) || 0;
      }
    }

    const selFin = financialByComp.get(selectedCompetence) || { valPa: 0, valReal: 0 };
    const totalPaValor = selFin.valPa;
    const totalRealValor = selFin.valReal;
    const difValor = totalRealValor - totalPaValor;
    const pctDifValor = totalPaValor !== 0 ? (difValor / totalPaValor) * 100 : 0;

    const compSumsMap = new Map<string, { pa: number; forecast: number; realizado: number }>();
    allMonths.forEach(m => compSumsMap.set(m, { pa: 0, forecast: 0, realizado: 0 }));

    for (const g of paGrouped) {
      const comp = g.competence?.trim();
      if (!comp || !compSumsMap.has(comp)) continue;
      compSumsMap.get(comp)!.pa = Number(g.pa) || 0;
    }

    for (const g of fcGrouped) {
      const comp = g.competence?.trim();
      if (!comp || !compSumsMap.has(comp)) continue;
      compSumsMap.get(comp)!.forecast = Number(g.forecast) || 0;
    }

    for (const g of actGrouped) {
      const comp = g.competence?.trim();
      if (!comp || !compSumsMap.has(comp)) continue;
      compSumsMap.get(comp)!.realizado = Number(g.realizado) || 0;
    }

    const selPa = compSumsMap.get(selectedCompetence)?.pa || 0;
    const selFc = compSumsMap.get(selectedCompetence)?.forecast || 0;
    const totalForecastValor = selPa > 0 && totalPaValor > 0
      ? Math.round(((selFc / selPa) * totalPaValor) * 100) / 100
      : totalPaValor;

    let evolutionChart = allMonths.map(comp => {
      const item = compSumsMap.get(comp)!;
      const finItem = financialByComp.get(comp) || { valPa: 0, valReal: 0 };
      const difFTE = item.realizado > 0 ? item.realizado - item.pa : null;
      const pctDif = item.realizado > 0 && item.pa > 0 ? ((item.realizado - item.pa) / item.pa) * 100 : null;
      const difVal = finItem.valReal > 0 ? finItem.valReal - finItem.valPa : null;
      const pctVal = finItem.valPa > 0 && finItem.valReal > 0 ? ((finItem.valReal - finItem.valPa) / finItem.valPa) * 100 : null;

      // Forecast R$ proporcional ao FTE planejado x baseline
      const valForecast = item.pa > 0 && finItem.valPa > 0
        ? Math.round(((item.forecast / item.pa) * finItem.valPa) * 100) / 100
        : finItem.valPa;

      return {
        competence: comp,
        pa: Math.round(item.pa),
        forecast: Math.round(item.forecast),
        realizado: Math.round(item.realizado),
        difFTE: difFTE !== null ? Math.round(difFTE) : null,
        pctDif: pctDif !== null ? Math.round(pctDif * 10) / 10 : null,
        hasRealizado: item.realizado > 0,
        valPa: Math.round(finItem.valPa * 100) / 100,
        valForecast: valForecast,
        valReal: Math.round(finItem.valReal * 100) / 100,
        difValor: difVal !== null ? Math.round(difVal * 100) / 100 : null,
        pctDifValor: pctVal !== null ? Math.round(pctVal * 10) / 10 : null
      };
    });

    // If 6 months requested, filter to window surrounding the selected competence
    if (historicalMonths === 6) {
      const selectedIdx = allMonths.indexOf(selectedCompetence);
      let startIdx = Math.max(0, selectedIdx - 5);
      if (startIdx + 6 > allMonths.length) {
        startIdx = Math.max(0, allMonths.length - 6);
      }
      evolutionChart = evolutionChart.slice(startIdx, startIdx + 6);
    }

    return NextResponse.json({
      selectedCompetence,
      previousCompetence,
      activeCompetences,
      cards: {
        totalPA: Math.round(grandTotalPA),
        totalForecast: Math.round(grandTotalFC),
        totalRealizado: Math.round(grandTotalReal),
        difPA: Math.round(difPA),
        difForecast: Math.round(difForecast),
        pctPA: pctPA !== null ? Math.round(pctPA * 100) / 100 : null,
        pctForecast: pctForecast !== null ? Math.round(pctForecast * 100) / 100 : null
      },
      financial: {
        totalPaValor: Math.round(totalPaValor * 100) / 100,
        totalForecastValor: Math.round(totalForecastValor * 100) / 100,
        totalRealValor: Math.round(totalRealValor * 100) / 100,
        difValor: Math.round(difValor * 100) / 100,
        pctDifValor: Math.round(pctDifValor * 100) / 100
      },
      topMaioresDesvios,
      topMenoresDesvios,
      evolutionChart,
      complementary: {
        contractsAbovePA: {
          count: abovePAContracts.length,
          percentage: totalEvaluatedContracts > 0 ? Math.round((abovePAContracts.length / totalEvaluatedContracts) * 1000) / 10 : 0,
          totalContracts: totalEvaluatedContracts
        },
        contractsOnLimitPA: {
          count: onLimitPAContracts.length,
          percentage: totalEvaluatedContracts > 0 ? Math.round((onLimitPAContracts.length / totalEvaluatedContracts) * 1000) / 10 : 0
        },
        contractsBelowPA: {
          count: belowPAContracts.length,
          percentage: totalEvaluatedContracts > 0 ? Math.round((belowPAContracts.length / totalEvaluatedContracts) * 1000) / 10 : 0
        },
        excedenteFTE: {
          positiveSum: Math.round(positiveExcessoSum),
          deficitSum: Math.round(negativeDeficitSum),
          netBalance: Math.round(positiveExcessoSum + negativeDeficitSum)
        },
        monthlyVariation: {
          currentReal: Math.round(grandTotalReal),
          previousReal: Math.round(prevRealTotal),
          diff: Math.round(momDiff),
          pct: Math.round(momPct * 100) / 100,
          trend: momDiff > 0 ? 'up' : (momDiff < 0 ? 'down' : 'stable')
        },
        marginStatus: {
          margemTotalPA: Math.round(margemTotalPA),
          margemTotalForecast: Math.round(margemTotalForecast),
          capacidadeNovasVagas: Math.round(capacidadeNovasVagas),
          contratosComMargem,
          contratosRequerAnalise,
          contratosSemMargem
        }
      }
    });
  } catch (error: any) {
    console.error('[API Comparativo Error]', error);
    return NextResponse.json({ error: error.message || 'Erro interno ao processar dados comparativos.' }, { status: 500 });
  }
}
