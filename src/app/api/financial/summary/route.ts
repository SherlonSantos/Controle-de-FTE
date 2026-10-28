export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isDemobilized } from '@/lib/demobilizationHelper';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const competence = searchParams.get('competence'); // e.g. "2026"
    
    if (!competence) {
      return NextResponse.json({ error: 'Competence (year) is required' }, { status: 400 });
    }

    const records = await prisma.financialRecord.findMany({
      where: {
        competence: {
          endsWith: competence
        }
      },
      include: {
        costCenter: { include: { operation: { include: { contract: true } } } }
      }
    });

    const summary = records.filter(r => !isDemobilized(r.competence, r.costCenter?.operation?.contract?.demobilizationDate)).map(record => ({
      id: record.id,
      costCenterId: record.costCenter.id,
      contractName: record.costCenter.operation?.contract?.name || 'Sem Contrato',
      costCenterCode: record.costCenter.code,
      costCenterDesc: record.costCenter.description || 'NÃO INFORMADO',
      type: record.type,
      metric: record.metric,
      scenario: record.scenario,
      competence: record.competence,
      value: record.value
    })).sort((a, b) => {
      const cmp = a.costCenterCode.localeCompare(b.costCenterCode);
      if (cmp !== 0) return cmp;
      if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
      if (a.scenario !== b.scenario) return a.scenario.localeCompare(b.scenario);
      return a.competence.localeCompare(b.competence);
    });

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error("Financial Summary Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
