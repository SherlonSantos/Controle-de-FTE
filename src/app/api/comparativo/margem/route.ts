import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractLocation } from '@/lib/locationHelper';
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      competence,
      contracts = [],
      locations = [],
      costCenters = [],
      roles = [],
      statusFilter = []
    } = body;

    if (!competence) {
      return NextResponse.json({ error: 'Competência é obrigatória para a análise de margem.' }, { status: 400 });
    }

    const [monthStr, yearStr] = competence.split('/');
    const yearInt = parseInt(yearStr || '2026', 10);

    // 1. Cost Center filters
    const ccFilter: any = {};
    if (costCenters.length > 0) ccFilter.id = { in: costCenters };
    if (contracts.length > 0) ccFilter.operation = { contract: { name: { in: contracts } } };

    // 2. Fetch Plan Versions (PA and FORECAST)
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

    // 3. Fetch Records concurrently
    const [paRecords, forecastRecords, activeRecords, governanceRecords] = await Promise.all([
      paVersion
        ? prisma.planRecord.findMany({
            where: {
              versionId: paVersion.id,
              competence,
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
              competence,
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
          competence,
          status: { not: 'Rescisão' },
          ...(Object.keys(ccFilter).length > 0 ? { costCenter: ccFilter } : {})
        },
        include: {
          costCenter: { include: { operation: { include: { contract: true } } } },
          role: true
        }
      }),
      prisma.governanceRecord.findMany({
        where: { competence },
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

    // 4. Combine into granular map: key = `${costCenterId}__${roleId}`
    type MarginRow = {
      id: string;
      competence: string;
      contractId: string;
      contractName: string;
      costCenterId: string;
      costCenterCode: string;
      costCenterDesc: string;
      location: string;
      roleId: string;
      roleTitle: string;
      pa: number;
      forecast: number;
      realizado: number;
      margemPA: number;
      margemForecast: number;
      margemSegura: number;
      margemDisponivel: number;
      limitante: 'PA' | 'Forecast' | 'Ambos' | 'Nenhum';
      statusPA: 'Dentro do PA' | 'No limite do PA' | 'Acima do PA';
      statusForecast: 'Dentro do Forecast' | 'No limite do Forecast' | 'Acima do Forecast';
      statusConsolidado: 'APROVADO' | 'REQUER ANÁLISE' | 'SEM MARGEM';
      motivoAnalise: string;
      justification?: string | null;
      responsible?: string | null;
      changeDate?: string | null;
      evidence?: any;
    };

    const rowMap = new Map<string, {
      contractId: string;
      contractName: string;
      costCenterId: string;
      costCenterCode: string;
      costCenterDesc: string;
      location: string;
      roleId: string;
      roleTitle: string;
      pa: number;
      forecast: number;
      realizado: number;
    }>();

    const getEntry = (cc: any, role: any) => {
      const key = `${cc.id}__${role.id}`;
      if (!rowMap.has(key)) {
        const ccCode = cc.code || '';
        const ccDesc = cc.description || '';
        const loc = extractLocation(ccDesc, ccCode);
        rowMap.set(key, {
          contractId: cc.operation?.contract?.id || '',
          contractName: cc.operation?.contract?.name || 'Sem Contrato',
          costCenterId: cc.id,
          costCenterCode: ccCode,
          costCenterDesc: ccDesc,
          location: loc,
          roleId: role.id,
          roleTitle: role.title || '',
          pa: 0,
          forecast: 0,
          realizado: 0
        });
      }
      return rowMap.get(key)!;
    };

    const isSubtotalRole = (ccCode: string, ccDesc: string, roleTitle: string) => {
      const roleClean = normalizeText(roleTitle);
      const ccCodeClean = normalizeText(ccCode);
      const ccDescFullClean = normalizeText(`${ccCode} - ${ccDesc}`);
      const ccDescClean = normalizeText(ccDesc);
      return roleClean === ccCodeClean || roleClean === ccDescFullClean || roleClean === ccDescClean;
    };

    // Populate PA
    for (const item of paRecords) {
      if (!item.costCenter || !item.role) continue;
      if (isDemobilized(competence, item.costCenter.operation?.contract?.demobilizationDate)) continue;
      if (isSubtotalRole(item.costCenter.code, item.costCenter.description || '', item.role.title)) continue;
      const entry = getEntry(item.costCenter, item.role);
      entry.pa += item.plannedFte || 0;
    }

    // Populate Forecast
    for (const item of forecastRecords) {
      if (!item.costCenter || !item.role) continue;
      if (isDemobilized(competence, item.costCenter.operation?.contract?.demobilizationDate)) continue;
      if (isSubtotalRole(item.costCenter.code, item.costCenter.description || '', item.role.title)) continue;
      const entry = getEntry(item.costCenter, item.role);
      const val = item.adjustedFte !== null ? item.adjustedFte : item.plannedFte;
      entry.forecast += val || 0;
    }

    // Populate Realizado
    for (const item of activeRecords) {
      if (!item.costCenter || !item.role) continue;
      if (isDemobilized(competence, item.costCenter.operation?.contract?.demobilizationDate)) continue;
      if (isSubtotalRole(item.costCenter.code, item.costCenter.description || '', item.role.title)) continue;
      const entry = getEntry(item.costCenter, item.role);
      entry.realizado += item.fteValue || 1.0;
    }

    // 5. Process rules for each row
    const detailedItems: MarginRow[] = [];

    for (const raw of rowMap.values()) {
      // Filter by location
      if (locations.length > 0 && !locations.includes(raw.location)) continue;
      // Filter by role
      if (roles.length > 0 && !roles.includes(raw.roleTitle)) continue;

      const pa = raw.pa;
      const forecast = raw.forecast;
      const real = raw.realizado;

      // Skip empty entries with 0 in all
      if (pa === 0 && forecast === 0 && real === 0) continue;

      const margemPA = pa - real;
      const margemForecast = forecast - real;
      const margemSegura = Math.min(margemPA, margemForecast);
      const margemDisponivel = Math.max(0, margemSegura);

      // Status PA
      let statusPA: 'Dentro do PA' | 'No limite do PA' | 'Acima do PA';
      if (real < pa) statusPA = 'Dentro do PA';
      else if (real === pa) statusPA = 'No limite do PA';
      else statusPA = 'Acima do PA';

      // Status Forecast
      let statusForecast: 'Dentro do Forecast' | 'No limite do Forecast' | 'Acima do Forecast';
      if (real < forecast) statusForecast = 'Dentro do Forecast';
      else if (real === forecast) statusForecast = 'No limite do Forecast';
      else statusForecast = 'Acima do Forecast';

      // Consolidated Status (Section 3, 4, 5)
      let statusConsolidado: 'APROVADO' | 'REQUER ANÁLISE' | 'SEM MARGEM';
      let motivoAnalise = '';

      if (real < pa && real < forecast) {
        statusConsolidado = 'APROVADO';
        motivoAnalise = `Possui margem simultânea no PA (+${margemPA}) e no Forecast (+${margemForecast}). Capacidade segura: ${margemDisponivel} FTE(s).`;
      } else if (real >= pa && real >= forecast) {
        statusConsolidado = 'SEM MARGEM';
        motivoAnalise = 'O quadro realizado já atingiu ou ultrapassou tanto o PA quanto o Forecast/Baseline.';
      } else {
        statusConsolidado = 'REQUER ANÁLISE';
        if (real < pa && real >= forecast) {
          motivoAnalise = 'O realizado possui margem em relação ao PA, porém já está no limite ou acima do Forecast/Baseline.';
        } else {
          motivoAnalise = 'O realizado possui margem em relação ao Forecast, porém já atingiu ou ultrapassou o PA.';
        }
      }

      // Limitante da Aprovação (Section 14)
      let limitante: 'PA' | 'Forecast' | 'Ambos' | 'Nenhum' = 'Nenhum';
      if (margemPA < margemForecast) {
        limitante = 'PA';
      } else if (margemForecast < margemPA) {
        limitante = 'Forecast';
      } else if (margemPA === margemForecast) {
        limitante = margemPA <= 0 ? 'Ambos' : 'Nenhum';
      }

      // Filter by status if specified
      if (statusFilter.length > 0 && !statusFilter.includes(statusConsolidado)) {
        continue;
      }

      // Match Governance
      const matchedGov = governanceRecords.find(g => {
        const contractMatch = g.contractId === raw.contractId || (g.contract && g.contract.name === raw.contractName);
        const roleMatch = g.roleId === raw.roleId || (g.role && g.role.title === raw.roleTitle);
        const ccMatch = !g.costCenterId || g.costCenterId === raw.costCenterId;
        return contractMatch && roleMatch && ccMatch;
      });

      let justification = matchedGov?.justification || null;
      let responsible = matchedGov?.approver?.name || matchedGov?.requester?.name || null;
      let changeDate = matchedGov?.approvalDate ? matchedGov.approvalDate.toISOString() : (matchedGov?.createdAt ? matchedGov.createdAt.toISOString() : null);
      let evidence = matchedGov?.evidences && matchedGov.evidences.length > 0 ? {
        id: matchedGov.evidences[0].id,
        fileName: matchedGov.evidences[0].fileName,
        filePath: matchedGov.evidences[0].filePath,
        fileType: matchedGov.evidences[0].fileType
      } : null;

      detailedItems.push({
        id: `${raw.costCenterId}__${raw.roleId}`,
        competence,
        contractId: raw.contractId,
        contractName: raw.contractName,
        costCenterId: raw.costCenterId,
        costCenterCode: raw.costCenterCode,
        costCenterDesc: raw.costCenterDesc,
        location: raw.location,
        roleId: raw.roleId,
        roleTitle: raw.roleTitle,
        pa,
        forecast,
        realizado: real,
        margemPA,
        margemForecast,
        margemSegura,
        margemDisponivel,
        limitante,
        statusPA,
        statusForecast,
        statusConsolidado,
        motivoAnalise,
        justification,
        responsible,
        changeDate,
        evidence
      });
    }

    // 6. Executive Summary Cards (Section 7, 8, 17)
    let totalPA = 0;
    let totalForecast = 0;
    let totalRealizado = 0;

    for (const item of detailedItems) {
      totalPA += item.pa;
      totalForecast += item.forecast;
      totalRealizado += item.realizado;
    }

    const margemTotalPA = totalPA - totalRealizado;
    const margemTotalForecast = totalForecast - totalRealizado;
    const margemSeguraTotal = Math.min(margemTotalPA, margemTotalForecast);
    const capacidadeNovasVagas = Math.max(0, margemSeguraTotal);

    // 7. Contract Aggregations with Drill-Down (Section 11)
    const contractMap = new Map<string, {
      name: string;
      pa: number;
      forecast: number;
      realizado: number;
      locations: Map<string, {
        name: string;
        pa: number;
        forecast: number;
        realizado: number;
        roles: any[];
      }>;
    }>();

    for (const item of detailedItems) {
      if (!contractMap.has(item.contractName)) {
        contractMap.set(item.contractName, {
          name: item.contractName,
          pa: 0,
          forecast: 0,
          realizado: 0,
          locations: new Map()
        });
      }
      const c = contractMap.get(item.contractName)!;
      c.pa += item.pa;
      c.forecast += item.forecast;
      c.realizado += item.realizado;

      if (!c.locations.has(item.location)) {
        c.locations.set(item.location, {
          name: item.location,
          pa: 0,
          forecast: 0,
          realizado: 0,
          roles: []
        });
      }
      const l = c.locations.get(item.location)!;
      l.pa += item.pa;
      l.forecast += item.forecast;
      l.realizado += item.realizado;

      l.roles.push({
        name: item.roleTitle,
        pa: item.pa,
        forecast: item.forecast,
        realizado: item.realizado,
        margemPA: item.margemPA,
        margemForecast: item.margemForecast,
        margemSegura: item.margemSegura,
        limitante: item.limitante,
        status: item.statusConsolidado,
        motivo: item.motivoAnalise,
        costCenterCode: item.costCenterCode
      });
    }

    let contratosComMargem = 0;
    let contratosRequerAnalise = 0;
    let contratosSemMargem = 0;
    let contratosAcimaPA = 0;
    let contratosAcimaForecast = 0;

    const contractSummary = Array.from(contractMap.values()).map(c => {
      const margemPA = c.pa - c.realizado;
      const margemForecast = c.forecast - c.realizado;
      const margemSegura = Math.min(margemPA, margemForecast);

      let status: 'APROVADO' | 'REQUER ANÁLISE' | 'SEM MARGEM';
      if (c.realizado < c.pa && c.realizado < c.forecast) {
        status = 'APROVADO';
        contratosComMargem++;
      } else if (c.realizado >= c.pa && c.realizado >= c.forecast) {
        status = 'SEM MARGEM';
        contratosSemMargem++;
      } else {
        status = 'REQUER ANÁLISE';
        contratosRequerAnalise++;
      }

      if (c.realizado > c.pa) contratosAcimaPA++;
      if (c.realizado > c.forecast) contratosAcimaForecast++;

      let limitante: 'PA' | 'Forecast' | 'Ambos' | 'Nenhum' = 'Nenhum';
      if (margemPA < margemForecast) limitante = 'PA';
      else if (margemForecast < margemPA) limitante = 'Forecast';
      else if (margemPA === margemForecast) limitante = margemPA <= 0 ? 'Ambos' : 'Nenhum';

      const locationsArr = Array.from(c.locations.values()).map(l => {
        const lMargemPA = l.pa - l.realizado;
        const lMargemFC = l.forecast - l.realizado;
        const lMargemSegura = Math.min(lMargemPA, lMargemFC);
        let lStatus: 'APROVADO' | 'REQUER ANÁLISE' | 'SEM MARGEM';
        if (l.realizado < l.pa && l.realizado < l.forecast) lStatus = 'APROVADO';
        else if (l.realizado >= l.pa && l.realizado >= l.forecast) lStatus = 'SEM MARGEM';
        else lStatus = 'REQUER ANÁLISE';

        return {
          name: l.name,
          pa: l.pa,
          forecast: l.forecast,
          realizado: l.realizado,
          margemPA: lMargemPA,
          margemForecast: lMargemFC,
          margemSegura: lMargemSegura,
          status: lStatus,
          roles: l.roles.sort((a, b) => a.margemSegura - b.margemSegura)
        };
      }).sort((a, b) => a.margemSegura - b.margemSegura);

      return {
        name: c.name,
        pa: c.pa,
        forecast: c.forecast,
        realizado: c.realizado,
        margemPA,
        margemForecast,
        margemSegura,
        limitante,
        status,
        locations: locationsArr
      };
    }).sort((a, b) => b.margemSegura - a.margemSegura);

    // 8. Automated Alerts (Section 16)
    const alerts: { type: 'warning' | 'danger' | 'info' | 'success'; message: string }[] = [];

    if (totalRealizado > totalPA) {
      alerts.push({
        type: 'danger',
        message: `O quadro geral realizado está ${totalRealizado - totalPA} FTE(s) acima do limite do PA.`
      });
    }

    if (totalRealizado > totalForecast) {
      alerts.push({
        type: 'warning',
        message: `O quadro geral realizado está ${totalRealizado - totalForecast} FTE(s) acima do limite do Forecast/Baseline.`
      });
    }

    if (capacidadeNovasVagas > 0) {
      alerts.push({
        type: 'success',
        message: `Existe capacidade global para acrescentar até ${capacidadeNovasVagas} novos FTE(s) mantendo o quadro dentro de PA e Forecast.`
      });
    } else {
      alerts.push({
        type: 'warning',
        message: 'Não existe capacidade global simultânea em PA e Forecast.'
      });
    }

    if (contratosAcimaPA > 0) {
      alerts.push({
        type: 'danger',
        message: `${contratosAcimaPA} contrato(s) estão operando acima do PA estabelecido.`
      });
    }

    if (contratosAcimaForecast > 0) {
      alerts.push({
        type: 'warning',
        message: `${contratosAcimaForecast} contrato(s) estão operando acima do Forecast/Baseline.`
      });
    }

    return NextResponse.json({
      cards: {
        totalPA,
        totalForecast,
        totalRealizado,
        margemTotalPA,
        margemTotalForecast,
        margemSeguraTotal,
        capacidadeNovasVagas,
        contratosComMargem,
        contratosRequerAnalise,
        contratosSemMargem,
        contratosAcimaPA,
        contratosAcimaForecast
      },
      contractSummary,
      detailedItems,
      alerts
    });
  } catch (error: any) {
    console.error('[API Comparativo Margem Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
