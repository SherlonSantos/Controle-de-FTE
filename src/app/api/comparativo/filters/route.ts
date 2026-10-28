import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractLocation, sortCompetences } from '@/lib/locationHelper';
import { isDemobilized } from '@/lib/demobilizationHelper';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filterCompetence = searchParams.get('competence');
    // 1. Fetch distinct competences from ActiveList and PlanRecord
    const activeComps = await prisma.activeList.findMany({
      select: { competence: true },
      distinct: ['competence']
    });

    const planComps = await prisma.planRecord.findMany({
      select: { competence: true },
      distinct: ['competence']
    });

    const rawComps = new Set<string>();
    activeComps.forEach(c => {
      if (c.competence && c.competence.includes('/')) rawComps.add(c.competence.trim());
    });
    planComps.forEach(c => {
      if (c.competence && c.competence.includes('/')) {
        const parts = c.competence.trim().split('/');
        if (parts.length === 2) {
          rawComps.add(c.competence.trim());
        } else if (parts.length === 3) {
          rawComps.add(`${parts[1]}/${parts[2]}`);
        }
      }
    });

    const activeListCompetences = sortCompetences(Array.from(rawComps).filter(c => activeComps.some(ac => ac.competence?.trim() === c)));
    const sortedCompetences = sortCompetences(Array.from(rawComps));

    // Default initial & final: prefer latest active competences if available
    let defaultInitial = '';
    let defaultFinal = '';
    if (activeListCompetences.length >= 2) {
      defaultInitial = activeListCompetences[activeListCompetences.length - 2];
      defaultFinal = activeListCompetences[activeListCompetences.length - 1];
    } else if (sortedCompetences.length >= 2) {
      defaultInitial = sortedCompetences[sortedCompetences.length - 2];
      defaultFinal = sortedCompetences[sortedCompetences.length - 1];
    } else if (sortedCompetences.length === 1) {
      defaultInitial = sortedCompetences[0];
      defaultFinal = sortedCompetences[0];
    }

    const targetComp = filterCompetence || defaultFinal;

    // 2. Contracts
    const contractsData = await prisma.contract.findMany({
      select: { id: true, name: true, demobilizationDate: true },
      orderBy: { name: 'asc' }
    });
    const contracts = contractsData
      .filter(c => !targetComp || !isDemobilized(targetComp, c.demobilizationDate))
      .map(c => c.name)
      .filter(Boolean);

    // 3. Cost Centers and Locations
    const costCentersData = await prisma.costCenter.findMany({
      select: {
        id: true,
        code: true,
        description: true,
        operation: {
          select: {
            contract: {
              select: { name: true, demobilizationDate: true }
            }
          }
        }
      },
      orderBy: { code: 'asc' }
    });

    const locationSet = new Set<string>();
    const costCenters = costCentersData
      .filter(cc => !targetComp || !isDemobilized(targetComp, cc.operation?.contract?.demobilizationDate))
      .map(cc => {
        const loc = extractLocation(cc.description, cc.code);
        if (loc && loc !== 'Não informada') locationSet.add(loc);
        return {
          id: cc.id,
          code: cc.code,
          description: cc.description || '',
          contractName: cc.operation?.contract?.name || 'Sem Contrato',
          location: loc
        };
      });

    const locations = Array.from(locationSet).sort();

    // 4. Roles
    const rolesData = await prisma.role.findMany({
      select: { id: true, title: true },
      orderBy: { title: 'asc' }
    });
    const roles = rolesData
      .map(r => r.title)
      .filter(t => t && !t.match(/^\d\.\d/)) // filter out dummy subtotal lines
      .sort();

    return NextResponse.json({
      competences: sortedCompetences,
      activeCompetences: activeListCompetences,
      contracts,
      contractsMetadata: contractsData.map(c => ({ name: c.name, demobilizationDate: c.demobilizationDate })),
      locations,
      costCenters,
      roles,
      defaultInitial,
      defaultFinal
    });
  } catch (error: any) {
    console.error('[API Comparativo Filters Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
