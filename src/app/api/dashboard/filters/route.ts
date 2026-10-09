import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Fetch unique competences from ActiveList and PlanRecord
    const activeCompetences = await prisma.activeList.findMany({
      select: { competence: true },
      distinct: ['competence']
    });
    
    const planCompetences = await prisma.planRecord.findMany({
      select: { competence: true },
      distinct: ['competence']
    });


    const competencesSet = new Set<string>();
    
    // Sort active to find the latest
    const sortedActive = [...activeCompetences].map(c => c.competence).sort((a, b) => {
      if (!a.includes('/') || !b.includes('/')) return 0;
      const [mA, yA] = a.split('/');
      const [mB, yB] = b.split('/');
      if (yA !== yB) return parseInt(yB) - parseInt(yA);
      return parseInt(mB) - parseInt(mA);
    });
    const latestActiveCompetence = sortedActive.length > 0 ? sortedActive[0] : null;

    activeCompetences.forEach(c => competencesSet.add(c.competence));
    planCompetences.forEach(c => competencesSet.add(c.competence));

    
    const competences = Array.from(competencesSet).sort((a, b) => {
      const [mA, yA] = a.split('/');
      const [mB, yB] = b.split('/');
      if (yA !== yB) return parseInt(yB) - parseInt(yA);
      return parseInt(mB) - parseInt(mA);
    });

    
    // Fetch all CostCenters with their Operation and Contract, plus lightweight relation checks
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

    // Filtro: Deixar apenas centros de custo que tenham pelo menos uma pessoa ativa (diferente de Rescisão) 
    // OU que possuam dados de planejamento (PA/Forecast). 
    // Removemos os CCs que SÓ têm demitidos e não têm PA.
    costCenters = costCenters.filter(cc => {
      const hasPlan = cc.planRecords.length > 0;
      const hasActiveNonRescisao = cc.activeLists.some(al => al.status !== 'Rescisão');
      const hasOnlyRescisao = cc.activeLists.length > 0 && cc.activeLists.every(al => al.status === 'Rescisão');
      
      // If it only has Rescisao and no Plan, filter it out
      if (hasOnlyRescisao && !hasPlan) return false;
      
      return true; // Keep everything else (e.g., CCs that are empty but might be needed, or CCs with valid people)
    });


    // Fetch unique statuses from ActiveList (per-month status)
    const activeListStatuses = await prisma.activeList.findMany({
      select: { status: true },
      distinct: ['status']
    });
    const statuses = activeListStatuses.map(e => e.status).filter(Boolean).sort();
    
    // Extract unique contract types and types dynamically
    const contractTypes = Array.from(new Set(costCenters.map(cc => cc.operation?.contract?.name).filter(Boolean))).sort();
    const types = Array.from(new Set(costCenters.map(cc => cc.type).filter(Boolean))).sort();
      const billingTypes = Array.from(new Set(costCenters.map(cc => cc.contractType).filter(Boolean))).sort();

    return NextResponse.json({
      competences,
      latestActiveCompetence,
      costCenters: costCenters.map(cc => ({
        id: cc.id,
        code: cc.code,
        name: cc.description,
        contractName: cc.operation?.contract?.name || 'Sem Contrato'
      })),
      statuses,
      contractTypes,
      types
    });
  } catch (error: any) {
    console.error("API /api/dashboard/filters Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
