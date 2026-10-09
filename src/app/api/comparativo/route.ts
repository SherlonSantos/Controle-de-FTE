import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractLocation, sortCompetences } from '@/lib/locationHelper';

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      initialCompetence,
      finalCompetence,
      scenario = 'Realizado', // 'Realizado' | 'PA' | 'Forecast'
      contracts = [],
      locations = [],
      costCenters = [],
      roles = [],
      movementTypes = []
    } = body;

    if (!initialCompetence || !finalCompetence) {
      return NextResponse.json({ error: 'Competência inicial e final são obrigatórias.' }, { status: 400 });
    }

    // --- 1. Fetch All Active / Plan Competences to build the Historical Evolution Chart ---
    let historicalCompetences: string[] = [];
    if (scenario === 'Realizado') {
      const distinctComps = await prisma.activeList.findMany({
        select: { competence: true },
        distinct: ['competence']
      });
      historicalCompetences = sortCompetences(distinctComps.map(c => c.competence).filter(Boolean));
    } else {
      const distinctComps = await prisma.planRecord.findMany({
        select: { competence: true },
        distinct: ['competence']
      });
      const normComps = new Set<string>();
      distinctComps.forEach(c => {
        if (!c.competence) return;
        const p = c.competence.trim().split('/');
        if (p.length === 2) normComps.add(c.competence.trim());
        else if (p.length === 3) normComps.add(`${p[1]}/${p[2]}`);
      });
      historicalCompetences = sortCompetences(Array.from(normComps));
    }

    // Ensure initial and final are in historical competences
    if (!historicalCompetences.includes(initialCompetence)) historicalCompetences.push(initialCompetence);
    if (!historicalCompetences.includes(finalCompetence)) historicalCompetences.push(finalCompetence);
    historicalCompetences = sortCompetences(Array.from(new Set(historicalCompetences)));

    // --- 2. Query Data for the Selected Scenario ---
    // We will build a matrix: key = `${costCenterId}__${roleId}`
    // and competence values: map[comp] = fte
    type RowEntry = {
      costCenterId: string;
      costCenterCode: string;
      costCenterDesc: string;
      contractId: string;
      contractName: string;
      location: string;
      roleId: string;
      roleTitle: string;
      compValues: Record<string, number>;
    };

    const matrix = new Map<string, RowEntry>();

    const getRowEntry = (
      ccId: string,
      ccCode: string,
      ccDesc: string,
      contractId: string,
      contractName: string,
      roleId: string,
      roleTitle: string
    ) => {
      const key = `${ccId}__${roleId}`;
      if (!matrix.has(key)) {
        const loc = extractLocation(ccDesc, ccCode);
        matrix.set(key, {
          costCenterId: ccId,
          costCenterCode: ccCode,
          costCenterDesc: ccDesc,
          contractId,
          contractName: contractName || 'Sem Contrato',
          location: loc,
          roleId,
          roleTitle,
          compValues: {}
        });
      }
      return matrix.get(key)!;
    };

    // CostCenter filter
    const ccFilter: any = {};
    if (costCenters.length > 0) {
      ccFilter.id = { in: costCenters };
    }
    if (contracts.length > 0) {
      ccFilter.operation = { contract: { name: { in: contracts } } };
    }

    if (scenario === 'Realizado') {
      const records = await prisma.activeList.findMany({
        where: {
          status: { not: 'Rescisão' },
          ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
        },
        include: {
          costCenter: { include: { operation: { include: { contract: true } } } },
          role: true
        }
      });

      for (const item of records) {
        const comp = item.competence?.trim();
        if (!comp) continue;

        const ccCode = item.costCenter?.code || '';
        const ccDesc = item.costCenter?.description || '';
        const roleTitle = item.role?.title || '';

        const roleClean = normalizeText(roleTitle);
        const ccCodeClean = normalizeText(ccCode);
        const ccDescFullClean = normalizeText(`${ccCode} - ${ccDesc}`);
        const ccDescClean = normalizeText(ccDesc);

        // Skip subtotal dummy rows
        if (roleClean === ccCodeClean || roleClean === ccDescFullClean || roleClean === ccDescClean) {
          continue;
        }

        const entry = getRowEntry(
          item.costCenter.id,
          ccCode,
          ccDesc,
          item.costCenter.operation?.contract?.id || '',
          item.costCenter.operation?.contract?.name || 'Sem Contrato',
          item.role.id,
          roleTitle
        );

        entry.compValues[comp] = (entry.compValues[comp] || 0) + (item.fteValue || 1.0);
      }
    } else {
      // PA or Forecast
      const planType = scenario === 'PA' ? 'PA' : 'FORECAST';
      const versions = await prisma.planVersion.findMany({
        where: { type: planType },
        orderBy: { createdAt: 'desc' }
      });

      const versionIds = versions.map(v => v.id);

      if (versionIds.length > 0) {
        const records = await prisma.planRecord.findMany({
          where: {
            versionId: { in: versionIds },
            ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
          },
          include: {
            costCenter: { include: { operation: { include: { contract: true } } } },
            role: true
          }
        });

        for (const item of records) {
          let comp = item.competence?.trim() || '';
          if (comp.includes('/')) {
            const p = comp.split('/');
            if (p.length === 3) comp = `${p[1]}/${p[2]}`;
          }
          if (!comp) continue;

          const ccCode = item.costCenter?.code || '';
          const ccDesc = item.costCenter?.description || '';
          const roleTitle = item.role?.title || '';

          const roleClean = normalizeText(roleTitle);
          const ccCodeClean = normalizeText(ccCode);
          const ccDescFullClean = normalizeText(`${ccCode} - ${ccDesc}`);
          const ccDescClean = normalizeText(ccDesc);

          if (roleClean === ccCodeClean || roleClean === ccDescFullClean || roleClean === ccDescClean) {
            continue;
          }

          const entry = getRowEntry(
            item.costCenter.id,
            ccCode,
            ccDesc,
            item.costCenter.operation?.contract?.id || '',
            item.costCenter.operation?.contract?.name || 'Sem Contrato',
            item.role.id,
            roleTitle
          );

          const val = planType === 'FORECAST' && item.adjustedFte !== null ? item.adjustedFte : item.plannedFte;
          entry.compValues[comp] = (entry.compValues[comp] || 0) + val;
        }
      }
    }

    // --- 3. Fetch Governance Records for matching ---
    const governanceRecords = await prisma.governanceRecord.findMany({
      where: {
        competence: { in: [finalCompetence, initialCompetence] }
      },
      include: {
        contract: true,
        costCenter: true,
        role: true,
        requester: true,
        approver: true,
        evidences: true
      }
    });

    // --- 4. Process Rows for the Comparative (initialCompetence vs finalCompetence) ---
    const allRows = Array.from(matrix.values());

    const detailedItems: any[] = [];

    for (const row of allRows) {
      // Filter by location if specified
      if (locations.length > 0 && !locations.includes(row.location)) {
        continue;
      }
      // Filter by role if specified
      if (roles.length > 0 && !roles.includes(row.roleTitle)) {
        continue;
      }

      const qtyInitial = row.compValues[initialCompetence] || 0;
      const qtyFinal = row.compValues[finalCompetence] || 0;
      const variation = qtyFinal - qtyInitial;

      // Classify movement type (Rule from Item 15):
      // Resultado > 0 e Inicial > 0: Acréscimo
      // Resultado < 0 e Final > 0: Redução
      // Anterior = 0 e Atual > 0: Inclusão de cargo
      // Anterior > 0 e Atual = 0: Exclusão de cargo
      // Resultado = 0: Sem alteração
      let movementType = 'Sem alteração';
      if (variation > 0) {
        movementType = qtyInitial === 0 ? 'Inclusão de cargo' : 'Acréscimo';
      } else if (variation < 0) {
        movementType = qtyFinal === 0 ? 'Exclusão de cargo' : 'Redução';
      }

      // Filter by movement type if specified
      if (movementTypes.length > 0 && !movementTypes.includes(movementType)) {
        continue;
      }

      // If both are 0 and no variation, skip to avoid empty clutter
      if (qtyInitial === 0 && qtyFinal === 0) {
        continue;
      }

      const pctVariation = qtyInitial === 0 ? (qtyFinal > 0 ? 100 : 0) : ((variation / qtyInitial) * 100);

      // Match Governance Record
      let matchedGov: any = null;
      if (variation !== 0) {
        matchedGov = governanceRecords.find(g => {
          const compMatch = g.competence === finalCompetence || g.competence === initialCompetence;
          const contractMatch = g.contractId === row.contractId || (g.contract && g.contract.name === row.contractName);
          const roleMatch = g.roleId === row.roleId || (g.role && g.role.title === row.roleTitle);
          const ccMatch = !g.costCenterId || g.costCenterId === row.costCenterId;
          return compMatch && contractMatch && roleMatch && ccMatch;
        });
      }

      let justification = null;
      let responsible = null;
      let changeDate: string | null = null;
      let evidence = null;
      let governanceStatus = 'Sem alteração';
      let governanceId = null;

      if (variation !== 0) {
        if (matchedGov) {
          justification = matchedGov.justification || 'Justificativa registrada na Governança';
          responsible = matchedGov.approver?.name || matchedGov.requester?.name || 'Gestor Autorizado';
          changeDate = matchedGov.approvalDate ? matchedGov.approvalDate.toISOString() : (matchedGov.createdAt ? matchedGov.createdAt.toISOString() : null);
          governanceStatus = matchedGov.status || 'APROVADO';
          governanceId = matchedGov.id;
          if (matchedGov.evidences && matchedGov.evidences.length > 0) {
            evidence = {
              id: matchedGov.evidences[0].id,
              fileName: matchedGov.evidences[0].fileName,
              filePath: matchedGov.evidences[0].filePath,
              fileType: matchedGov.evidences[0].fileType
            };
          }
        } else {
          governanceStatus = 'Governança pendente';
          justification = 'Alteração sem justificativa cadastrada na Governança';
          responsible = 'Pendente';
        }
      }

      detailedItems.push({
        id: `${row.costCenterId}_${row.roleId}`,
        initialCompetence,
        finalCompetence,
        contractId: row.contractId,
        contractName: row.contractName,
        location: row.location,
        costCenterId: row.costCenterId,
        costCenterCode: row.costCenterCode,
        costCenterDesc: row.costCenterDesc,
        roleId: row.roleId,
        roleTitle: row.roleTitle,
        qtyInitial,
        qtyFinal,
        variation,
        pctVariation,
        movementType,
        justification,
        responsible,
        changeDate,
        evidence,
        governanceStatus,
        governanceId
      });
    }

    // --- 5. Executive KPIs ---
    let totalInitial = 0;
    let totalFinal = 0;
    let additions = 0;
    let reductions = 0;
    const contractsWithChange = new Set<string>();
    const locationsWithChange = new Set<string>();
    const rolesWithChange = new Set<string>();
    let unjustifiedChangesCount = 0;

    for (const item of detailedItems) {
      totalInitial += item.qtyInitial;
      totalFinal += item.qtyFinal;

      if (item.variation > 0) {
        additions += item.variation;
      } else if (item.variation < 0) {
        reductions += Math.abs(item.variation);
      }

      if (item.variation !== 0) {
        contractsWithChange.add(item.contractName);
        locationsWithChange.add(item.location);
        rolesWithChange.add(item.roleTitle);

        if (item.governanceStatus === 'Governança pendente') {
          unjustifiedChangesCount += 1;
        }
      }
    }

    const netBalance = additions - reductions;
    const totalVariation = totalFinal - totalInitial;
    const totalPctVariation = totalInitial === 0 ? 0 : (totalVariation / totalInitial) * 100;
    const totalAlteredFTE = additions + reductions;
    const alteredPercentage = totalInitial === 0 ? 0 : (totalAlteredFTE / totalInitial) * 100;

    const kpis = {
      totalInitial,
      totalFinal,
      variation: totalVariation,
      pctVariation: totalPctVariation,
      additions,
      reductions,
      netBalance,
      contractsChangedCount: contractsWithChange.size,
      locationsChangedCount: locationsWithChange.size,
      rolesChangedCount: rolesWithChange.size,
      unjustifiedChangesCount,
      alteredPercentage
    };

    // --- 6. Historical Evolution Chart (Barras + Linha) ---
    // Calculate total FTE for every competence in historicalCompetences
    const evolutionMap: Record<string, { fte: number; rows: RowEntry[] }> = {};
    for (const comp of historicalCompetences) {
      evolutionMap[comp] = { fte: 0, rows: [] };
    }

    for (const row of allRows) {
      // Apply same filters
      if (locations.length > 0 && !locations.includes(row.location)) continue;
      if (roles.length > 0 && !roles.includes(row.roleTitle)) continue;

      for (const comp of historicalCompetences) {
        const val = row.compValues[comp] || 0;
        evolutionMap[comp].fte += val;
      }
    }

    const evolutionChartData: any[] = [];
    let prevFte: number | null = null;
    for (let i = 0; i < historicalCompetences.length; i++) {
      const comp = historicalCompetences[i];
      const curFte = evolutionMap[comp].fte;

      let pctVar = 0;
      if (prevFte !== null && prevFte > 0) {
        pctVar = ((curFte - prevFte) / prevFte) * 100;
      }

      // Calculate additions/reductions from prev comp
      let compAdditions = 0;
      let compReductions = 0;
      const compContracts = new Set<string>();
      const compRoles = new Set<string>();

      if (i > 0) {
        const prevComp = historicalCompetences[i - 1];
        for (const row of allRows) {
          if (locations.length > 0 && !locations.includes(row.location)) continue;
          if (roles.length > 0 && !roles.includes(row.roleTitle)) continue;

          const pVal = row.compValues[prevComp] || 0;
          const cVal = row.compValues[comp] || 0;
          const diff = cVal - pVal;
          if (diff > 0) {
            compAdditions += diff;
            compContracts.add(row.contractName);
            compRoles.add(row.roleTitle);
          } else if (diff < 0) {
            compReductions += Math.abs(diff);
            compContracts.add(row.contractName);
            compRoles.add(row.roleTitle);
          }
        }
      }

      evolutionChartData.push({
        competence: comp,
        totalFte: curFte,
        pctVariation: prevFte === null ? null : parseFloat(pctVar.toFixed(2)),
        additions: compAdditions,
        reductions: compReductions,
        netBalance: compAdditions - compReductions,
        contractsChanged: compContracts.size,
        rolesChanged: compRoles.size
      });

      prevFte = curFte;
    }

    // --- 7. Contract Comparison (Horizontal Bars) ---
    const contractMap = new Map<string, {
      contract: string;
      qtyInitial: number;
      qtyFinal: number;
      rolesDelta: Map<string, number>;
      locsDelta: Map<string, number>;
    }>();

    for (const item of detailedItems) {
      if (!contractMap.has(item.contractName)) {
        contractMap.set(item.contractName, {
          contract: item.contractName,
          qtyInitial: 0,
          qtyFinal: 0,
          rolesDelta: new Map(),
          locsDelta: new Map()
        });
      }
      const cEntry = contractMap.get(item.contractName)!;
      cEntry.qtyInitial += item.qtyInitial;
      cEntry.qtyFinal += item.qtyFinal;

      if (item.variation !== 0) {
        cEntry.rolesDelta.set(item.roleTitle, (cEntry.rolesDelta.get(item.roleTitle) || 0) + item.variation);
        cEntry.locsDelta.set(item.location, (cEntry.locsDelta.get(item.location) || 0) + item.variation);
      }
    }

    const contractChartData = Array.from(contractMap.values()).map(c => {
      const variation = c.qtyFinal - c.qtyInitial;
      const pctVariation = c.qtyInitial === 0 ? (c.qtyFinal > 0 ? 100 : 0) : ((variation / c.qtyInitial) * 100);

      // find top altered role
      let topRole = '-';
      let maxRoleAbs = 0;
      c.rolesDelta.forEach((val, r) => {
        if (Math.abs(val) > maxRoleAbs) {
          maxRoleAbs = Math.abs(val);
          topRole = `${r} (${val > 0 ? '+' : ''}${val})`;
        }
      });

      // find top altered location
      let topLocation = '-';
      let maxLocAbs = 0;
      c.locsDelta.forEach((val, l) => {
        if (Math.abs(val) > maxLocAbs) {
          maxLocAbs = Math.abs(val);
          topLocation = `${l} (${val > 0 ? '+' : ''}${val})`;
        }
      });

      return {
        contract: c.contract,
        qtyInitial: c.qtyInitial,
        qtyFinal: c.qtyFinal,
        variation,
        pctVariation: parseFloat(pctVariation.toFixed(1)),
        topRole,
        topLocation,
        status: variation > 0 ? 'aumento' : variation < 0 ? 'reducao' : 'sem_alteracao'
      };
    }).sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation));

    // --- 8. Location Comparison Hierarchical Drill-Down (Contrato -> Localidade -> Cargo) ---
    const treeRoot = new Map<string, any>();
    for (const item of detailedItems) {
      if (!treeRoot.has(item.contractName)) {
        treeRoot.set(item.contractName, {
          name: item.contractName,
          qtyInitial: 0,
          qtyFinal: 0,
          locations: new Map<string, any>()
        });
      }
      const cNode = treeRoot.get(item.contractName);
      cNode.qtyInitial += item.qtyInitial;
      cNode.qtyFinal += item.qtyFinal;

      if (!cNode.locations.has(item.location)) {
        cNode.locations.set(item.location, {
          name: item.location,
          qtyInitial: 0,
          qtyFinal: 0,
          roles: new Map<string, any>()
        });
      }
      const lNode = cNode.locations.get(item.location);
      lNode.qtyInitial += item.qtyInitial;
      lNode.qtyFinal += item.qtyFinal;

      if (!lNode.roles.has(item.roleTitle)) {
        lNode.roles.set(item.roleTitle, {
          name: item.roleTitle,
          qtyInitial: 0,
          qtyFinal: 0,
          costCenterCode: item.costCenterCode
        });
      }
      const rNode = lNode.roles.get(item.roleTitle);
      rNode.qtyInitial += item.qtyInitial;
      rNode.qtyFinal += item.qtyFinal;
    }

    const locationTree = Array.from(treeRoot.values()).map(cNode => {
      const cVar = cNode.qtyFinal - cNode.qtyInitial;
      const cPct = cNode.qtyInitial === 0 ? (cNode.qtyFinal > 0 ? 100 : 0) : ((cVar / cNode.qtyInitial) * 100);

      const locationsArr = Array.from(cNode.locations.values()).map((lNode: any) => {
        const lVar = lNode.qtyFinal - lNode.qtyInitial;
        const lPct = lNode.qtyInitial === 0 ? (lNode.qtyFinal > 0 ? 100 : 0) : ((lVar / lNode.qtyInitial) * 100);

        const rolesArr = Array.from(lNode.roles.values()).map((rNode: any) => {
          const rVar = rNode.qtyFinal - rNode.qtyInitial;
          const rPct = rNode.qtyInitial === 0 ? (rNode.qtyFinal > 0 ? 100 : 0) : ((rVar / rNode.qtyInitial) * 100);
          return {
            name: rNode.name,
            qtyInitial: rNode.qtyInitial,
            qtyFinal: rNode.qtyFinal,
            variation: rVar,
            pctVariation: parseFloat(rPct.toFixed(1)),
            costCenterCode: rNode.costCenterCode
          };
        }).sort((a: any, b: any) => Math.abs(b.variation) - Math.abs(a.variation));

        return {
          name: lNode.name,
          qtyInitial: lNode.qtyInitial,
          qtyFinal: lNode.qtyFinal,
          variation: lVar,
          pctVariation: parseFloat(lPct.toFixed(1)),
          roles: rolesArr
        };
      }).sort((a: any, b: any) => Math.abs(b.variation) - Math.abs(a.variation));

      return {
        name: cNode.name,
        qtyInitial: cNode.qtyInitial,
        qtyFinal: cNode.qtyFinal,
        variation: cVar,
        pctVariation: parseFloat(cPct.toFixed(1)),
        locations: locationsArr
      };
    }).sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation));

    // --- 9. Rankings of Biggest Movements (Aumentos / Reduções por Contrato, Localidade, Cargo) ---
    const buildRankings = (keyGetter: (item: any) => string) => {
      const agg = new Map<string, { name: string; qtyInitial: number; qtyFinal: number; delta: number }>();
      for (const item of detailedItems) {
        const k = keyGetter(item);
        if (!agg.has(k)) {
          agg.set(k, { name: k, qtyInitial: 0, qtyFinal: 0, delta: 0 });
        }
        const entry = agg.get(k)!;
        entry.qtyInitial += item.qtyInitial;
        entry.qtyFinal += item.qtyFinal;
        entry.delta += item.variation;
      }
      const list = Array.from(agg.values());
      const increases = list
        .filter(x => x.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 10);
      const reductions = list
        .filter(x => x.delta < 0)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 10);
      return { increases, reductions };
    };

    const rankings = {
      byContract: buildRankings(i => i.contractName),
      byLocation: buildRankings(i => i.location),
      byRole: buildRankings(i => i.roleTitle)
    };

    // --- 10. Role Composition Analysis (Composição do Quadro) ---
    const roleCompositionMap = new Map<string, { role: string; initial: number; final: number }>();
    for (const item of detailedItems) {
      if (!roleCompositionMap.has(item.roleTitle)) {
        roleCompositionMap.set(item.roleTitle, { role: item.roleTitle, initial: 0, final: 0 });
      }
      const r = roleCompositionMap.get(item.roleTitle)!;
      r.initial += item.qtyInitial;
      r.final += item.qtyFinal;
    }

    const roleComposition = Array.from(roleCompositionMap.values())
      .map(r => {
        const variation = r.final - r.initial;
        const shareInitial = totalInitial > 0 ? (r.initial / totalInitial) * 100 : 0;
        const shareFinal = totalFinal > 0 ? (r.final / totalFinal) * 100 : 0;
        const shareDiff = shareFinal - shareInitial;
        return {
          role: r.role,
          initial: r.initial,
          final: r.final,
          variation,
          shareInitial: parseFloat(shareInitial.toFixed(2)),
          shareFinal: parseFloat(shareFinal.toFixed(2)),
          shareDiff: parseFloat(shareDiff.toFixed(2))
        };
      })
      .sort((a, b) => (b.final + b.initial) - (a.final + a.initial))
      .slice(0, 20); // top 20 roles

    // --- 11. Automated Executive Insights ---
    const insights: string[] = [];

    if (totalVariation > 0) {
      insights.push(`O quadro aumentou ${totalVariation.toFixed(0)} FTEs entre ${initialCompetence} e ${finalCompetence} (+${totalPctVariation.toFixed(1)}%).`);
    } else if (totalVariation < 0) {
      insights.push(`O quadro reduziu ${Math.abs(totalVariation).toFixed(0)} FTEs entre ${initialCompetence} e ${finalCompetence} (${totalPctVariation.toFixed(1)}%).`);
    } else {
      insights.push(`O total de efetivo manteve-se estável em ${totalFinal.toFixed(0)} FTEs entre ${initialCompetence} e ${finalCompetence}.`);
    }

    if (rankings.byContract.increases.length > 0) {
      const topContractInc = rankings.byContract.increases[0];
      insights.push(`O Contrato ${topContractInc.name} apresentou o maior crescimento, com +${topContractInc.delta.toFixed(0)} FTEs.`);
    }

    if (rankings.byLocation.reductions.length > 0) {
      const topLocRed = rankings.byLocation.reductions[0];
      insights.push(`A Localidade ${topLocRed.name} apresentou a maior redução, com ${topLocRed.delta.toFixed(0)} FTEs.`);
    }

    if (rankings.byRole.increases.length > 0) {
      const topRoleInc = rankings.byRole.increases[0];
      insights.push(`O cargo ${topRoleInc.name} apresentou o maior acréscimo (+${topRoleInc.delta.toFixed(0)} FTEs).`);
    }

    if (unjustifiedChangesCount > 0) {
      insights.push(`${unjustifiedChangesCount} alteraç${unjustifiedChangesCount > 1 ? 'ões' : 'ão'} de FTE não possu${unjustifiedChangesCount > 1 ? 'em' : 'i'} justificativa cadastrada na Governança.`);
    }

    // Growth concentration insight
    if (additions > 0 && rankings.byContract.increases.length >= 2) {
      const top2Sum = rankings.byContract.increases.slice(0, 2).reduce((sum, c) => sum + c.delta, 0);
      const concentration = Math.round((top2Sum / additions) * 100);
      if (concentration >= 40) {
        insights.push(`${concentration}% do crescimento do quadro está concentrado em dois contratos (${rankings.byContract.increases[0].name} e ${rankings.byContract.increases[1].name}).`);
      }
    }

    return NextResponse.json({
      kpis,
      evolutionChartData,
      contractChartData,
      locationTree,
      rankings,
      roleComposition,
      insights,
      detailedItems
    });
  } catch (error: any) {
    console.error('[API Comparativo Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
