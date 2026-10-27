import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncGovernanceToForecast } from '@/lib/forecastGovernanceSync';

// Mock user for now since auth is not fully configured
const MOCK_USER_ID = 'cfee0e9c-e773-46ca-a305-0023b9a070b4';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const competence = searchParams.get('competence');
    const contractId = searchParams.get('contractId');
    const costCenterId = searchParams.get('costCenterId');
    const roleId = searchParams.get('roleId');
    const status = searchParams.get('status');
    const origin = searchParams.get('origin');
    const justificationStatus = searchParams.get('justificationStatus');
    const batchId = searchParams.get('batchId');

    const where: any = {};
    if (competence && competence !== 'TODOS') where.competence = competence;
    if (contractId && contractId !== 'TODOS') where.contractId = contractId;
    if (costCenterId && costCenterId !== 'TODOS') where.costCenterId = costCenterId;
    if (roleId && roleId !== 'TODOS') where.roleId = roleId;
    if (status && status !== 'TODOS') where.status = status;
    if (origin && origin !== 'TODOS') where.origin = origin;
    if (justificationStatus && justificationStatus !== 'TODOS') where.justificationStatus = justificationStatus;
    if (batchId && batchId !== 'TODOS') where.batchId = batchId;

    const records = await prisma.governanceRecord.findMany({
      where,
      include: {
        contract: true,
        costCenter: true,
        role: true,
        requester: true,
        approver: true,
        justifierUser: true,
        evidences: true,
        batch: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('Error fetching governance records:', error);
    return NextResponse.json({ error: 'Failed to fetch governance records' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let user = await prisma.user.findFirst();
    const userId = user?.id || MOCK_USER_ID;

    const body = await request.json();
    const {
      competence,
      contractId,
      costCenterId,
      roleId,
      type, // ACRESCIMO, RETIRADA, CORRECAO
      previousQuantity,
      movedQuantity,
      justification,
      notes,
    } = body;

    if (!competence || !contractId || !roleId || !type || movedQuantity === undefined || !justification) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (movedQuantity <= 0) {
      return NextResponse.json({ error: 'Moved quantity must be greater than zero' }, { status: 400 });
    }

    // Calculate final quantity based on type
    let finalQuantity = Number(previousQuantity);
    if (type === 'ACRESCIMO') {
      finalQuantity += Number(movedQuantity);
    } else if (type === 'RETIRADA') {
      finalQuantity -= Number(movedQuantity);
      if (finalQuantity < 0) {
         return NextResponse.json({ error: 'Cannot withdraw more than existing quantity' }, { status: 400 });
      }
    } else if (type === 'CORRECAO') {
      finalQuantity = Number(movedQuantity);
    }

    const deltaQuantity = type === 'RETIRADA' ? -Number(movedQuantity) : Number(movedQuantity);

    const record = await prisma.governanceRecord.create({
      data: {
        competence,
        contractId,
        costCenterId: costCenterId || null,
        roleId,
        type,
        previousQuantity: Number(previousQuantity),
        movedQuantity: Number(movedQuantity),
        finalQuantity,
        justification,
        status: 'APROVADO',
        origin: 'MANUAL',
        justificationStatus: 'JUSTIFICADO',
        justificationDate: new Date(),
        justifierUserId: userId,
        paQuantity: Number(previousQuantity),
        previousForecastQuantity: Number(previousQuantity),
        currentForecastQuantity: finalQuantity,
        deltaQuantity,
        notes: notes || null,
        requesterId: userId,
      },
      include: {
        contract: true,
        costCenter: true,
        role: true,
        evidences: true,
      }
    });

    // Espelha automaticamente a alteração na base de Forecast (PlanRecord) para refletir no Dashboard e Administração
    if (costCenterId) {
      await syncGovernanceToForecast({
        competence,
        costCenterId,
        roleId,
        finalQuantity,
        justification
      });
    }

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Error creating governance record:', error);
    return NextResponse.json({ error: 'Failed to create governance record' }, { status: 500 });
  }
}
