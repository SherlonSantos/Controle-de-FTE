import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const count = await prisma.governanceRecord.count({
      where: {
        justificationStatus: 'PENDENTE',
      },
    });

    return NextResponse.json({ count });
  } catch (error: any) {
    console.error('Error fetching pending governance count:', error);
    return NextResponse.json({ count: 0 });
  }
}
