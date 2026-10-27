import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncGovernanceToForecast, revertGovernanceFromForecast } from '@/lib/forecastGovernanceSync';

async function recalcForecastAdjustedFte(competence: string, costCenterId: string | null, roleId: string) {
  // Find the forecast record
  const planRecords = await prisma.planRecord.findMany({
    where: {
      competence,
      roleId,
      costCenterId: costCenterId || undefined,
      version: { type: 'FORECAST' }
    }
  });

  if (planRecords.length === 0) return;

  // Find all approved governance records for this combination
  const approvedGovs = await prisma.governanceRecord.findMany({
    where: {
      competence,
      roleId,
      costCenterId,
      status: 'APROVADO'
    }
  });

  let delta = 0;
  for (const gov of approvedGovs) {
    if (gov.type === 'ACRESCIMO') delta += gov.movedQuantity;
    else if (gov.type === 'RETIRADA') delta -= gov.movedQuantity;
    else if (gov.type === 'CORRECAO') {
       // Correção might be absolute or delta, our previous logic was absolute overriding, 
       // but delta is safer if multiple records. Let's stick to absolute if there's a correction,
       // but typically there's only one. For simplicity, we just use the first CORRECAO as base if it exists.
    }
  }

  // Update
  for (const pr of planRecords) {
     // If there is a CORRECAO, we'd need to handle it. Assuming CORRECAO overwrites:
     const correcao = approvedGovs.reverse().find(g => g.type === 'CORRECAO');
     let baseFte = correcao ? correcao.movedQuantity : pr.plannedFte;
     
     // Only add deltas from records created AFTER the correction? Too complex.
     // Let's assume CORRECAO sets it, but if user uses ACRESCIMO/RETIRADA, we just add/sub from plannedFte.
     if (!correcao) {
        await prisma.planRecord.update({
          where: { id: pr.id },
          data: { adjustedFte: pr.plannedFte + delta }
        });
     } else {
        await prisma.planRecord.update({
          where: { id: pr.id },
          data: { adjustedFte: correcao.movedQuantity }
        });
     }
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const record = await prisma.governanceRecord.findUnique({
      where: { id },
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
    });

    if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    return NextResponse.json(record);
  } catch (error: any) {
    console.error('Error fetching single governance record:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    let user = await prisma.user.findFirst();
    const userId = user?.id || 'cfee0e9c-e773-46ca-a305-0023b9a070b4';

    const body = await request.json();
    const { 
      competence, 
      contractId, 
      costCenterId, 
      roleId, 
      type, 
      previousQuantity, 
      movedQuantity, 
      justification,
      justificationStatus,
      status,
      notes
    } = body;

    const record = await prisma.governanceRecord.findUnique({ where: { id } });
    if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    let finalQuantity = Number(previousQuantity ?? record.previousQuantity);
    const moved = movedQuantity !== undefined ? Number(movedQuantity) : record.movedQuantity;
    const currentType = type || record.type;

    if (currentType === 'ACRESCIMO') finalQuantity += moved;
    else if (currentType === 'RETIRADA') finalQuantity -= moved;
    else if (currentType === 'CORRECAO') finalQuantity = moved;

    const isJustified = justification && justification.trim().length > 0;
    const newJustificationStatus = justificationStatus || (isJustified ? 'JUSTIFICADO' : record.justificationStatus);

    const updated = await prisma.governanceRecord.update({
      where: { id },
      data: {
        ...(competence ? { competence } : {}),
        ...(contractId ? { contractId } : {}),
        ...(costCenterId !== undefined ? { costCenterId } : {}),
        ...(roleId ? { roleId } : {}),
        ...(type ? { type } : {}),
        ...(previousQuantity !== undefined ? { previousQuantity: Number(previousQuantity) } : {}),
        ...(movedQuantity !== undefined ? { movedQuantity: Number(movedQuantity) } : {}),
        finalQuantity,
        ...(justification ? { justification } : {}),
        ...(status ? { status } : {}),
        justificationStatus: newJustificationStatus,
        ...(isJustified && !record.justificationDate ? { justificationDate: new Date(), justifierUserId: userId } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      include: {
        contract: true,
        costCenter: true,
        role: true,
        requester: true,
        approver: true,
        justifierUser: true,
        evidences: true,
        batch: true,
      }
    });

    // Sincroniza a alteração diretamente no Forecast (PlanRecord) para refletir no Dashboard e Administração
    if (updated.costCenterId) {
      await syncGovernanceToForecast({
        competence: updated.competence,
        costCenterId: updated.costCenterId,
        roleId: updated.roleId,
        finalQuantity: updated.finalQuantity,
        justification: updated.justification
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating governance record:', error);
    return NextResponse.json({ error: 'Failed to update governance record' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const record = await prisma.governanceRecord.findUnique({ where: { id } });
    if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    await prisma.governanceRecord.delete({ where: { id } });

    // Ao excluir o registro de governança, reverte o PlanRecord para a quantidade anterior
    if (record.costCenterId) {
      await revertGovernanceFromForecast({
        competence: record.competence,
        costCenterId: record.costCenterId,
        roleId: record.roleId,
        previousQuantity: record.previousQuantity
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting governance record:', error);
    return NextResponse.json({ error: 'Failed to delete governance record' }, { status: 500 });
  }
}
