import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {

    const { searchParams } = new URL(request.url);
    const competence = searchParams.get('competence');
    const contractId = searchParams.get('contractId');

    if (!competence || !contractId) {
      return NextResponse.json({ error: 'Missing competence or contractId' }, { status: 400 });
    }

    // Fetch context data
    // Here we can aggregate PlanRecords for the given competence and contract
    // We get the Roles and CostCenters mapped for this contract
    
    // Simplification for the UI: We return a list of available roles for the given contract
    const operations = await prisma.operation.findMany({
      where: { contractId },
      select: {
        costCenters: {
          select: {
            id: true,
            code: true,
            description: true,
            planRecords: {
              where: { competence },
              include: {
                role: true,
                version: true
              }
            }
          }
        }
      }
    });

    const contextMap = new Map<string, any>();

    // Agrupa e prioriza a versão vigente de Forecast sobre o PA para cada (Centro de Custo, Cargo)
    operations.forEach(op => {
      op.costCenters.forEach(cc => {
        cc.planRecords.forEach(record => {
          const key = `${cc.id}_${record.role.id}`;
          const currentFte = record.adjustedFte !== null && record.adjustedFte !== undefined 
            ? record.adjustedFte 
            : record.plannedFte;

          const itemData = {
            costCenterId: cc.id,
            costCenterName: `${cc.code} - ${cc.description || ''}`,
            roleId: record.role.id,
            roleName: record.role.title,
            plannedFte: record.plannedFte,
            adjustedFte: currentFte,
            type: record.version.type, // "PA" or "FORECAST"
            versionStatus: record.version.status
          };

          if (!contextMap.has(key)) {
            contextMap.set(key, itemData);
          } else {
            const existing = contextMap.get(key);
            // Prioriza FORECAST sobre PA
            if (record.version.type === 'FORECAST' && existing.type !== 'FORECAST') {
              contextMap.set(key, itemData);
            } else if (record.version.type === 'FORECAST' && existing.type === 'FORECAST') {
              // Entre versões de FORECAST, prioriza a VIGENTE
              if (record.version.status === 'VIGENTE') {
                contextMap.set(key, itemData);
              }
            }
          }
        });
      });
    });

    const results = Array.from(contextMap.values());
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching context:', error);
    return NextResponse.json({ error: 'Failed to fetch context' }, { status: 500 });
  }
}
