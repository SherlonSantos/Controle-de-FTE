import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const MOCK_USER_ID = 'cfee0e9c-e773-46ca-a305-0023b9a070b4';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = MOCK_USER_ID;
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const { status, note } = await request.json();
    
    if (!['APROVADO', 'REPROVADO', 'CANCELADO'].includes(status)) {
       return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const record = await prisma.governanceRecord.findUnique({
      where: { id }
    });

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Update Governance Record
    const updatedRecord = await prisma.governanceRecord.update({
      where: { id },
      data: {
        status,
        approverId: userId,
        approvalDate: new Date(),
        approverNote: note || null,
      }
    });

    // If approved, we must update the adjustedFte in the PlanRecord
    // The user requested that this alters the FORECAST base as well.
    if (status === 'APROVADO') {
       // Find all matching PA and FORECAST records
       const planRecords = await prisma.planRecord.findMany({
         where: {
           competence: record.competence,
           roleId: record.roleId,
           costCenterId: record.costCenterId || undefined,
           version: {
             type: 'FORECAST'
           }
         },
         include: { version: true }
       });

       // We also need to ensure FORECAST exists. If it doesn't, we create it.
       const hasForecast = planRecords.some(pr => pr.version.type === 'FORECAST');
       
       if (!hasForecast) {
          // Extract year from competence (e.g. 07/2026 -> 2026)
          const yearInt = parseInt(record.competence.split('/')[1], 10);
          
          let forecastVersion = await prisma.planVersion.findFirst({ 
             where: { year: yearInt, type: 'FORECAST' } 
          });

          if (!forecastVersion) {
             forecastVersion = await prisma.planVersion.create({
                data: { type: 'FORECAST', year: yearInt, description: `Forecast ${yearInt}` }
             });
          }

          if (record.costCenterId) {
            const newForecastRecord = await prisma.planRecord.create({
              data: {
                versionId: forecastVersion.id,
                costCenterId: record.costCenterId,
                roleId: record.roleId,
                competence: record.competence,
                plannedFte: record.previousQuantity, // base
                adjustedFte: record.previousQuantity // will be updated below
              },
              include: { version: true }
            });
            planRecords.push(newForecastRecord);
          }
       }

       // Update all matching records
       for (const pr of planRecords) {
         const currentFte = pr.adjustedFte !== null ? pr.adjustedFte : pr.plannedFte;
         let newAdjustedFte = currentFte;
         
         if (record.type === 'ACRESCIMO') {
            newAdjustedFte += record.movedQuantity;
         } else if (record.type === 'RETIRADA') {
            newAdjustedFte -= record.movedQuantity;
         } else if (record.type === 'CORRECAO') {
            newAdjustedFte = record.movedQuantity;
         }

         await prisma.planRecord.update({
           where: { id: pr.id },
           data: {
             adjustedFte: newAdjustedFte
           }
         });
       }
    }

    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error('Error updating governance status:', error);
    return NextResponse.json({ error: 'Failed to update governance status' }, { status: 500 });
  }
}
