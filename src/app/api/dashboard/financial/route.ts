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
      return NextResponse.json({
        custoBrutoPA: 0,
        custoBrutoRealizado: 0,
        custoLiquido: 0,
        receitaBrutaPA: 0,
        receitaBrutaRealizada: 0,
        receitaBrutaLiquida: 0,
        valorLiquido: 0,
        valorLiquidoPA: 0,
        variacaoTotalPA: 0,
        variacaoTotalReal: 0,
        variacaoDif: 0,
        variacaoDifPercent: 0
      });
    }

    const ccFilter: any = {};
    if (costCenters.length > 0) ccFilter.id = { in: costCenters };
    if (contractTypes.length > 0) ccFilter.operation = { contract: { name: { in: contractTypes } } };
    if (types.length > 0) ccFilter.type = { in: types };
      if (billingTypes.length > 0) ccFilter.contractType = { in: billingTypes };

    // Prepare where clause for FinancialRecord
    const whereClause: any = {
      competence: { in: competences }
    };
    
    if (Object.keys(ccFilter).length > 0) {
      whereClause.costCenter = ccFilter;
    }

    const records = await prisma.financialRecord.findMany({
      where: whereClause,
      include: { costCenter: { include: { operation: { include: { contract: true } } } } }
    });

    let custoBrutoPA = 0;
    let custoBrutoRealizado = 0;
    let receitaBrutaPA = 0;
    let receitaBrutaRealizada = 0;

    for (const record of records) {
      if (isDemobilized(record.competence, record.costCenter?.operation?.contract?.demobilizationDate)) continue;
      const metric = (record.metric || '').trim().toLowerCase();
      const scenario = (record.scenario || '').trim().toLowerCase();
      const value = Number(record.value) || 0;

      const isCusto = record.type === 'Custo' || (metric.includes('custo') && metric.includes('totais'));
      const isReceita = record.type === 'Receita' || (metric.includes('receita') && metric.includes('bruta'));
      
      const isPA = scenario === 'pa';
      const isRealizado = scenario === 'realizado';

      if (isCusto) {
        const absValue = Math.abs(value);
        if (isPA) custoBrutoPA += absValue;
        if (isRealizado) custoBrutoRealizado += absValue;
      }
      
      if (isReceita) {
        if (isPA) receitaBrutaPA += value;
        if (isRealizado) receitaBrutaRealizada += value;
      }
    }

    const custoLiquido = custoBrutoRealizado - custoBrutoPA;
    const receitaBrutaLiquida = receitaBrutaRealizada - receitaBrutaPA;
    const valorLiquidoPA = receitaBrutaPA - custoBrutoPA;
    const valorLiquido = receitaBrutaRealizada - custoBrutoRealizado;

    // Fetch VariacaoRecord data
    const variacaoRecords = await prisma.variacaoRecord.findMany({
      where: { competence: { in: competences } },
      include: { costCenter: { include: { operation: { include: { contract: true } } } } }
    });

    let validCCodes: string[] = [];
    let hasFilter = Object.keys(ccFilter).length > 0;
    if (hasFilter) {
      const validCCs = await prisma.costCenter.findMany({ where: ccFilter, select: { code: true } });
      validCCodes = validCCs.map(c => c.code);
    }

    let variacaoTotalPA = 0;
    let variacaoTotalReal = 0;
    
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

      variacaoTotalPA += Number(record.valPa) || 0;
      variacaoTotalReal += Number(record.valReal) || 0;
    }
    
    const variacaoDif = variacaoTotalReal - variacaoTotalPA;
    const variacaoDifPercent = variacaoTotalPA !== 0 ? (variacaoDif / variacaoTotalPA) * 100 : 0;

    return NextResponse.json({
      custoBrutoPA,
      custoBrutoRealizado,
      custoLiquido,
      receitaBrutaPA,
      receitaBrutaRealizada,
      receitaBrutaLiquida,
      valorLiquido,
      valorLiquidoPA,
      variacaoTotalPA,
      variacaoTotalReal,
      variacaoDif,
      variacaoDifPercent
    });

  } catch (error: any) {
    console.error('[API Dashboard Financial Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
