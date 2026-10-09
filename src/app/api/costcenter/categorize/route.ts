import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const costCenters = await prisma.costCenter.findMany({
      where: {
        OR: [
          {
            planRecords: {
              some: {
                version: {
                  type: 'PA'
                }
              }
            }
          },
          {
            activeLists: {
              some: {
                status: {
                  not: 'Rescisão'
                }
              }
            }
          }
        ]
      },
      select: {
        id: true,
        code: true,
        description: true,
        contractType: true,
        type: true,
      },
      orderBy: {
        code: 'asc',
      }
    });
    return NextResponse.json(costCenters);
  } catch (error: any) {
    console.error('[API CostCenter Categorize GET Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const { updates } = data; // Expected: [{ id: 'cc-id', contractType: 'FTE', type: 'Operação' }, ...]

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const promises = updates.map(update => 
      prisma.costCenter.update({
        where: { id: update.id },
        data: {
          contractType: update.contractType,
          type: update.type,
        }
      })
    );

    await Promise.all(promises);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API CostCenter Categorize PUT Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
