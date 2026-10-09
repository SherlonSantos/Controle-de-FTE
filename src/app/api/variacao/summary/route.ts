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

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
