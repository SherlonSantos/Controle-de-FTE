import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const contracts = await prisma.contract.findMany({
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(contracts);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const { contractId, demobilizationDate } = data;
    
    if (!contractId) {
      return NextResponse.json({ error: 'Missing contractId' }, { status: 400 });
    }

    let parsedDate: Date | null = null;
    if (demobilizationDate) {
      if (typeof demobilizationDate === 'string' && demobilizationDate.length === 7) {
        parsedDate = new Date(`${demobilizationDate}-01T12:00:00.000Z`);
      } else {
        parsedDate = new Date(demobilizationDate);
      }
    }

    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: {
        demobilizationDate: parsedDate
      }
    });

    return NextResponse.json(contract);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
