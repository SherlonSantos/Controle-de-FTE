export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isDemobilized } from '@/lib/demobilizationHelper';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const competence = searchParams.get('competence'); // e.g. "01/2026"

    if (!competence) {
      return NextResponse.json({ error: 'Competence is required' }, { status: 400 });
    }

    const contracts = await prisma.contract.findMany();
    const contractDemobMap = new Map();
    for (const c of contracts) {
      if (c.demobilizationDate) contractDemobMap.set(c.name, c.demobilizationDate);
    }
    const records = await prisma.variacaoRecord.findMany({
      where: {
        competence: competence
      },
      include: {
        costCenter: { include: { operation: { include: { contract: true } } } }
      }
    });

    // We can just return the raw records, ordered by whether they are overhead or not
    const filteredRecords = records.filter(r => !isDemobilized(r.competence, contractDemobMap.get(r.contractName)));
    const sortedRecords = filteredRecords.sort((a, b) => {
        if (a.isOverhead === b.isOverhead) {
            return a.contractName.localeCompare(b.contractName);
        }
        return a.isOverhead ? 1 : -1;
    });

    return NextResponse.json({ summary: sortedRecords });
  } catch (error: any) {
    console.error("API /api/variacao/summary Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
