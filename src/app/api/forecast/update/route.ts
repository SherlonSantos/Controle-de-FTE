import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

// Endpoint for adding a new Role (POST) or Updating a cell (PUT)
export async function PUT(req: Request) {
  try {
    const { year: rawYear, costCenterId, roleId, monthIndex, value, justification, notes } = await req.json();

    if (!rawYear || !costCenterId || !roleId || monthIndex === undefined || value === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Support both 'YYYY' and 'MM/YYYY' formats
    const year = rawYear.includes('/') ? rawYear.split('/')[1] : rawYear;
    const yearInt = parseInt(year, 10);

    let version = await prisma.planVersion.findFirst({ 
      where: { year: yearInt, type: 'FORECAST' },
      orderBy: { createdAt: 'desc' }
    });
    if (!version) {
       version = await prisma.planVersion.create({
          data: { type: 'FORECAST', year: yearInt, description: `Forecast ${year}` }
       });
    }

    const mm = String(monthIndex + 1).padStart(2, '0');
    const competence = `${mm}/${year}`;

    // Get previous record
    const existingRecord = await prisma.planRecord.findUnique({
      where: {
        versionId_costCenterId_roleId_competence: {
          versionId: version.id,
          costCenterId,
          roleId,
          competence
        }
      }
    });

    const prevFte = existingRecord 
      ? (existingRecord.adjustedFte !== null ? existingRecord.adjustedFte : existingRecord.plannedFte)
      : 0;

    const delta = value - prevFte;

    await prisma.planRecord.upsert({
      where: {
        versionId_costCenterId_roleId_competence: {
          versionId: version.id,
          costCenterId,
          roleId,
          competence
        }
      },
      update: { plannedFte: value, adjustedFte: value },
      create: {
        versionId: version.id,
        costCenterId,
        roleId,
        competence,
        plannedFte: value,
        adjustedFte: value
      }
    });

    // If there is an FTE variation and a justification was provided, record in Governança (MANUAL)
    if (Math.abs(delta) > 0.0001) {
      const cc = await prisma.costCenter.findUnique({
        where: { id: costCenterId },
        include: { operation: { include: { contract: true } } }
      });

      let user = await prisma.user.findFirst();
      const userId = user?.id || 'cfee0e9c-e773-46ca-a305-0023b9a070b4';

      if (cc && cc.operation?.contract) {
        await prisma.governanceRecord.create({
          data: {
            competence,
            contractId: cc.operation.contract.id,
            costCenterId,
            roleId,
            type: delta > 0 ? 'ACRESCIMO' : 'RETIRADA',
            previousQuantity: prevFte,
            movedQuantity: Math.abs(delta),
            finalQuantity: value,
            justification: justification || 'Alteração manual no Forecast',
            status: 'APROVADO',
            origin: 'MANUAL',
            justificationStatus: 'JUSTIFICADO',
            justificationDate: new Date(),
            justifierUserId: userId,
            previousForecastQuantity: prevFte,
            currentForecastQuantity: value,
            deltaQuantity: delta,
            notes: notes || null,
            requesterId: userId,
          }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API Forecast PUT Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { year: rawYear, costCenterId, roleTitle } = await req.json();

    if (!rawYear || !costCenterId || !roleTitle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Support both 'YYYY' and 'MM/YYYY' formats
    const year = rawYear.includes('/') ? rawYear.split('/')[1] : rawYear;
    const yearInt = parseInt(year, 10);

    // Find or create role
    let role = await prisma.role.findUnique({ where: { title: roleTitle } });
    if (!role) {
      role = await prisma.role.create({ data: { title: roleTitle } });
    }

    let version = await prisma.planVersion.findFirst({ where: { year: yearInt, type: 'FORECAST' } });
    if (!version) {
       version = await prisma.planVersion.create({
          data: { type: 'FORECAST', year: yearInt, description: `Forecast ${year}` }
       });
    }

    // Insert 0 for all 12 months so it appears in the summary
    for(let i=0; i<12; i++) {
       const mm = String(i + 1).padStart(2, '0');
       const competence = `${mm}/${year}`;
       await prisma.planRecord.upsert({
          where: {
            versionId_costCenterId_roleId_competence: {
              versionId: version.id,
              costCenterId,
              roleId: role.id,
              competence
            }
          },
          update: {},
          create: {
            versionId: version.id,
            costCenterId,
            roleId: role.id,
            competence,
            plannedFte: 0
          }
       });
    }

    return NextResponse.json({ success: true, role });
  } catch (error: any) {
    console.error('[API Forecast POST Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { year: rawYear, costCenterId, roleId } = await req.json();

    if (!rawYear || !costCenterId || !roleId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Support both 'YYYY' and 'MM/YYYY' formats
    const year = rawYear.includes('/') ? rawYear.split('/')[1] : rawYear;
    const yearInt = parseInt(year, 10);

    const version = await prisma.planVersion.findFirst({ where: { year: yearInt, type: 'FORECAST' } });
    if (!version) return NextResponse.json({ success: true }); // Nothing to delete
    
    await prisma.planRecord.deleteMany({
      where: {
        versionId: version.id,
        costCenterId,
        roleId
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API Forecast DELETE Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
