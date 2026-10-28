import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isDemobilized } from '@/lib/demobilizationHelper';

export const runtime = 'nodejs';


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const competence = searchParams.get('competence'); // Format: MM/YYYY
    const statusesParam = searchParams.get('statuses'); // Format: "Ativo,Demitido"

    if (!competence) {
      return NextResponse.json({ error: 'Competence is required' }, { status: 400 });
    }

    const statuses = statusesParam ? statusesParam.split(',').filter(Boolean) : [];

    // 1. Fetch available statuses for this competence (from ActiveList, not Employee)
    const allActiveLists = await prisma.activeList.findMany({
      where: { competence },
      select: { status: true }
    });
    const availableStatuses = Array.from(new Set(allActiveLists.map(a => a.status).filter(Boolean))).sort();

    // 2. Fetch filtered items for the summary
    const activeLists = await prisma.activeList.findMany({
      where: {
        competence: competence,
        ...(statuses.length > 0 ? { status: { in: statuses } } : {})
      },
      include: {
        costCenter: { include: { operation: { include: { contract: true } } } },
        role: true
      }
    });

    // Grouping by CostCenter and Role in-memory for speed and full data access
    const summaryMap = new Map<string, any>();

    for (const item of activeLists) {
      if (isDemobilized(item.competence, item.costCenter?.operation?.contract?.demobilizationDate)) continue;
      const cc = item.costCenter;
      const role = item.role;
      const key = `${cc.id}_${role.id}`;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          id: key,
          costCenterId: cc.id,
          costCenterCode: cc.code,
          costCenterDesc: cc.description || '',
          contractName: cc.operation?.contract?.name || 'Sem Contrato',
          contractType: cc.contractType || '',
          roleId: role.id,
          roleTitle: role.title,
          headcount: 0
        });
      }
      
      const record = summaryMap.get(key);
      record.headcount += 1;
    }

    // Convert map values to array
    const summary = Array.from(summaryMap.values());
    
    // Order alphabetically by Cost Center code, then Role title
    summary.sort((a, b) => {
      const ccCompare = a.costCenterCode.localeCompare(b.costCenterCode);
      if (ccCompare !== 0) return ccCompare;
      return a.roleTitle.localeCompare(b.roleTitle);
    });

    return NextResponse.json({ summary, availableStatuses });
    
  } catch (error: any) {
    console.error('[API Ativos Summary Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
