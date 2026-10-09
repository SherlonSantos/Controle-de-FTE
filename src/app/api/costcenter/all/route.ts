import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  try {
    
    let costCenters = await prisma.costCenter.findMany({
      include: {
        operation: {
          include: {
            contract: true
          }
        },
        activeLists: {
          select: { status: true }
        },
        planRecords: {
          select: { id: true },
          take: 1
        }
      },
      orderBy: { code: 'asc' }
    });

    costCenters = costCenters.filter(cc => {
      const hasPlan = cc.planRecords.length > 0;
      const hasOnlyRescisao = cc.activeLists.length > 0 && cc.activeLists.every(al => al.status === 'Rescisão');
      if (hasOnlyRescisao && !hasPlan) return false;
      return true;
    });

    const data = costCenters.map(cc => ({

      id: cc.id,
      code: cc.code,
      description: cc.description || '',
      contractName: cc.operation?.contract?.name || 'Sem Contrato'
    }));

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API CostCenter All GET Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
