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

    const results: any[] = [];

    // Flatten data to send to the frontend
    operations.forEach(op => {
      op.costCenters.forEach(cc => {
        cc.planRecords.forEach(record => {
          results.push({
            costCenterId: cc.id,
            costCenterName: `${cc.code} - ${cc.description || ''}`,
            roleId: record.role.id,
            roleName: record.role.title,
            plannedFte: record.plannedFte,
            adjustedFte: record.adjustedFte ?? record.plannedFte, // Fallback to planned if null
            type: record.version.type // "PA" or "FORECAST"
          });
        });
      });
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching context:', error);
    return NextResponse.json({ error: 'Failed to fetch context' }, { status: 500 });
  }
}
