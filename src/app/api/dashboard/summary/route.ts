import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

function isDemobilized(competence: any, demobDate: any) {
  if (!demobDate) return false;
  if (!competence || !competence.includes('/')) return false;
  const [mm, yyyy] = competence.split('/');
  const compDate = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, 1);
  const demob = new Date(demobDate);
  demob.setDate(1);
  demob.setHours(0,0,0,0);
  return compDate >= demob;
}


export async function POST(req: Request) {
  try {
    const { competences = [], costCenters = [], statuses = [], contractTypes = [], types = [], billingTypes = [] } = await req.json();

    if (!competences.length) {
      return NextResponse.json({ summary: [], totals: { pa: 0, forecast: 0, realized: 0 } });
    }

    // Build a CostCenter filter
    const ccFilter: any = {};
    if (costCenters.length > 0) ccFilter.id = { in: costCenters };
    if (contractTypes.length > 0) ccFilter.operation = { contract: { name: { in: contractTypes } } };
    if (types.length > 0) ccFilter.type = { in: types };
      if (billingTypes.length > 0) ccFilter.contractType = { in: billingTypes };

    let totalPA = 0;
    let totalForecast = 0;
    let totalRealized = 0;
    const summaryMap = new Map<string, any>();

    const getMapEntry = (ccId: string, ccCode: string, ccDesc: string, roleId: string, roleTitle: string, contractName: string) => {
      const key = `${ccId}_${roleId}`;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          costCenterId: ccId,
          costCenterCode: ccCode,
          costCenterDesc: ccDesc,
          roleId,
          roleTitle,
          contractName,
          pa: 0,
          forecast: 0,
          realized: 0,
          justification: ''
        });
      }
      return summaryMap.get(key);
    };

    // --- FETCH ACTIVE LIST (Realized) ---
    const activeRecords = await prisma.activeList.findMany({
      where: {
        competence: { in: competences },
        ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
        ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
      },
      include: {
        costCenter: { include: { operation: { include: { contract: true } } } },
        role: true
      }
    });

    const normalizeText = (s: string) => {
      return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    };

    for (const item of activeRecords) {
      const ccCode = item.costCenter.code || '';
      const ccDesc = item.costCenter.description || '';
      const roleTitle = item.role.title || '';
      
      const roleClean = normalizeText(roleTitle);
      const ccCodeClean = normalizeText(ccCode);
      const ccDescFullClean = normalizeText(`${ccCode} - ${ccDesc}`);
      const ccDescClean = normalizeText(ccDesc);
      
      if (roleClean === ccCodeClean || roleClean === ccDescFullClean || roleClean === ccDescClean) {
        continue;
      }
      
      const entry = getMapEntry(
        item.costCenter.id, ccCode, ccDesc,
        item.role.id, roleTitle,
        item.costCenter.operation?.contract?.name || 'Sem Contrato'
      );
      entry.realized += 1;
      totalRealized += 1;
    }

    // --- FETCH PLAN RECORD (PA & Forecast) ---
    for (const comp of competences) {
      const [monthStr, yearStr] = comp.split('/');
      const yearInt = parseInt(yearStr);

      const paVersion = await prisma.planVersion.findFirst({
        where: { year: yearInt, type: 'PA' },
        orderBy: { createdAt: 'desc' }
      });

      if (paVersion) {
        const paRecords = await prisma.planRecord.findMany({
          where: {
            versionId: paVersion.id,
            competence: comp,
            ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
          },
          include: {
            costCenter: { include: { operation: { include: { contract: true } } } },
            role: true
          }
        });
        for (const item of paRecords) {
          const ccCode = item.costCenter.code || '';
          const ccDesc = item.costCenter.description || '';
          const roleTitle = item.role.title || '';
          
          const roleClean = normalizeText(roleTitle);
          const ccCodeClean = normalizeText(ccCode);
          const ccDescFullClean = normalizeText(`${ccCode} - ${ccDesc}`);
          const ccDescClean = normalizeText(ccDesc);
          
          // Removed skipping of fake roles so Forecast totals are preserved
          
          const entry = getMapEntry(
            item.costCenter.id, ccCode, ccDesc,
            item.role.id, roleTitle,
            item.costCenter.operation?.contract?.name || 'Sem Contrato'
          );
          entry.pa += item.plannedFte;
          totalPA += item.plannedFte;
        }
      }

      const forecastVersion = await prisma.planVersion.findFirst({
        where: { year: yearInt, type: 'FORECAST' },
        orderBy: { createdAt: 'desc' }
      });

      if (forecastVersion) {
        const forecastRecords = await prisma.planRecord.findMany({
          where: {
            versionId: forecastVersion.id,
            competence: comp,
            ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
          },
          include: {
            costCenter: { include: { operation: { include: { contract: true } } } },
            role: true
          }
        });
        for (const item of forecastRecords) {
          const ccCode = item.costCenter.code || '';
          const ccDesc = item.costCenter.description || '';
          const roleTitle = item.role.title || '';
          
          const roleClean = normalizeText(roleTitle);
          const ccCodeClean = normalizeText(ccCode);
          const ccDescFullClean = normalizeText(`${ccCode} - ${ccDesc}`);
          const ccDescClean = normalizeText(ccDesc);
          
          // Removed skipping of fake roles so Forecast totals are preserved

          const entry = getMapEntry(
            item.costCenter.id, ccCode, ccDesc,
            item.role.id, roleTitle,
            item.costCenter.operation?.contract?.name || 'Sem Contrato'
          );
          const forecastVal = item.adjustedFte !== null ? item.adjustedFte : item.plannedFte;
          entry.forecast += forecastVal;
          totalForecast += forecastVal;
          if (item.justification) {
            entry.justification = item.justification;
          }
        }
      }
    }

    // --- FETCH GOVERNANCE JUSTIFICATIONS ---
    const governanceRecords = await prisma.governanceRecord.findMany({
      where: { competence: { in: competences } },
      include: { contract: true, role: true }
    });

    for (const entry of summaryMap.values()) {
      if (!entry.justification) {
        const gov = governanceRecords.find(g =>
          (g.roleId === entry.roleId || g.role?.title === entry.roleTitle) &&
          (g.contract?.name === entry.contractName || !g.contractId) &&
          (!g.costCenterId || g.costCenterId === entry.costCenterId)
        );
        if (gov?.justification) {
          entry.justification = gov.justification;
        }
      }
    }

    const summary = Array.from(summaryMap.values());

    // --- FETCH FINANCIAL DATA FOR TABLE ---
    const financialRecords = await prisma.financialRecord.findMany({
      where: {
        competence: { in: competences },
        ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
      },
      include: { costCenter: { include: { operation: { include: { contract: true } } } } }
    });

    const financialByCC: Record<string, any> = {};
    for (const record of financialRecords) {
      const ccCode = record.costCenter.code;
      if (!financialByCC[ccCode]) {
        financialByCC[ccCode] = {
          custoBrutoPA: 0, custoBrutoRealizado: 0,
          receitaBrutaPA: 0, receitaBrutaRealizada: 0,
          valorLiquidoPA: 0, valorLiquido: 0
        };
      }

      const metric = (record.metric || '').trim().toLowerCase();
      const scenario = (record.scenario || '').trim().toLowerCase();
      const value = Number(record.value) || 0;

      const isCusto = record.type === 'Custo' || (metric.includes('custo') && metric.includes('totais'));
      const isReceita = record.type === 'Receita' || (metric.includes('receita') && metric.includes('bruta'));
      const isPA = scenario === 'pa';
      const isRealizado = scenario === 'realizado';

      if (isCusto) {
        const absValue = Math.abs(value);
        if (isPA) financialByCC[ccCode].custoBrutoPA += absValue;
        if (isRealizado) financialByCC[ccCode].custoBrutoRealizado += absValue;
      }
      
      if (isReceita) {
        if (isPA) financialByCC[ccCode].receitaBrutaPA += value;
        if (isRealizado) financialByCC[ccCode].receitaBrutaRealizada += value;
      }
    }

    // --- FETCH VARIACAO FTE DATA FOR TABLE ---
    const variacaoRecords = await prisma.variacaoRecord.findMany({
      where: { competence: { in: competences } },
      include: { costCenter: { include: { operation: { include: { contract: true } } } } }
    });

    const variacaoByPrefix: Record<string, any> = {};
    
    // Validate prefixes to avoid returning prefixes that don't match the active ccFilter
    let validCCodes: string[] = [];
    let hasFilter = Object.keys(ccFilter).length > 0;
    if (hasFilter) {
      const validCCs = await prisma.costCenter.findMany({ where: ccFilter, select: { code: true } });
      validCCodes = validCCs.map(c => c.code);
    }

    for (const record of variacaoRecords) {
      let prefix = "";
      if (record.contractName) {
         prefix = record.contractName.split('-')[0].replace(/\./g, '').trim().substring(0, 6);
      }
      if (!prefix && record.costCenter) {
         prefix = record.costCenter.code.substring(0, 6);
      }
      if (!prefix) continue;

      if (hasFilter) {
        if (!validCCodes.some(code => code.startsWith(prefix))) {
          continue;
        }
      }

      if (!variacaoByPrefix[prefix]) {
        variacaoByPrefix[prefix] = {
          variacaoTotalPA: 0, variacaoTotalReal: 0,
          variacaoDif: 0, variacaoDifPercent: 0
        };
      }
      variacaoByPrefix[prefix].variacaoTotalPA += Number(record.valPa) || 0;
      variacaoByPrefix[prefix].variacaoTotalReal += Number(record.valReal) || 0;
    }

    for (const prefix in variacaoByPrefix) {
      const d = variacaoByPrefix[prefix];
      d.variacaoDif = d.variacaoTotalReal - d.variacaoTotalPA;
      d.variacaoDifPercent = d.variacaoTotalPA === 0 ? 0 : (d.variacaoDif / d.variacaoTotalPA) * 100;
    }

    return NextResponse.json({
      summary,
      financialByCC,
      variacaoByPrefix,
      totals: {
        pa: totalPA,
        forecast: totalForecast,
        realized: totalRealized
      }
    });

  } catch (error: any) {
    console.error('[API Dashboard Summary Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
