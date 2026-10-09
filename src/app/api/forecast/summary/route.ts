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


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const competence = searchParams.get('competence'); // Format: YYYY or MM/YYYY

    if (!competence) {
      return NextResponse.json({ error: 'Competence is required' }, { status: 400 });
    }

    const year = competence.includes('/') ? competence.split('/')[1] : competence;
    const yearInt = parseInt(year, 10);

    const version = await prisma.planVersion.findFirst({
      where: { year: yearInt, type: 'FORECAST' },
      orderBy: { createdAt: 'desc' }
    });

    if (!version) {
      return NextResponse.json({ summary: [] });
    }

    // Fetch records for FORECAST
    const planRecords = await prisma.planRecord.findMany({
      where: {
        versionId: version.id
      },
      include: {
        costCenter: { include: { operation: { include: { contract: true } } } },
        role: true
      }
    });

    const summaryMap = new Map<string, any>();

    for (const item of planRecords) {
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
          months: [0,0,0,0,0,0,0,0,0,0,0,0]
        });
      }
      
      const record = summaryMap.get(key);
      if (isDemobilized(item.competence, cc.operation?.contract?.demobilizationDate)) {
        continue;
      }
      const [mm] = item.competence.split('/');
      const mIdx = parseInt(mm, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
         record.months[mIdx] += (item.adjustedFte !== null ? item.adjustedFte : item.plannedFte); // Sum adjusted or planned FTE
      }
    }

    const summary = Array.from(summaryMap.values());
    
    summary.sort((a, b) => {
      const ccCompare = a.costCenterCode.localeCompare(b.costCenterCode);
      if (ccCompare !== 0) return ccCompare;
      return a.roleTitle.localeCompare(b.roleTitle);
    });

    return NextResponse.json({ summary });
    
  } catch (error: any) {
    console.error('[API Forecast Summary Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
