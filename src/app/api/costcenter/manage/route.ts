import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

// POST: Create a new CC
export async function POST(req: Request) {
  try {
    const { code, description, contractName } = await req.json();

    if (!code || !contractName) {
      return NextResponse.json({ error: 'Code and Contract Name are required' }, { status: 400 });
    }

    const cName = contractName.trim().toUpperCase();

    // 1. Find or create Contract
    
    let contract = await prisma.contract.findFirst({
      where: { name: cName }
    });
    if (!contract) {
      try {
        contract = await prisma.contract.create({ data: { name: cName } });
      } catch (err: any) {
        if (err.code === 'P2002') {
          contract = await prisma.contract.findFirst({ where: { name: cName } });
        } else {
          throw err;
        }
      }
    }


    // 2. Find or create Operation for this Contract
    // A single generic operation named matching the contract is enough for this mapping
    
    let operation = await prisma.operation.findFirst({ where: { contractId: contract?.id } });
    if (!operation && contract) {
      try {
        operation = await prisma.operation.create({
          data: {
            name: cName,
            contractId: contract.id
          }
        });
      } catch(err: any) {
        if (err.code === 'P2002') {
          operation = await prisma.operation.findFirst({ where: { contractId: contract.id } });
        } else {
          throw err;
        }
      }
    }
    
    if (!contract) throw new Error("Conflito de nome de contrato (tente verificar espaços em branco ou letras maiúsculas/minúsculas).");
    if (!operation) throw new Error("Falha ao resolver Operação");


    // 3. Create CostCenter
    const cc = await prisma.costCenter.create({
      data: {
        code: code.trim(),
        description: description ? description.trim() : null,
        operationId: operation.id,
        contractType: 'NÃO INFORMADO',
        type: 'NÃO INFORMADO'
      }
    });

    return NextResponse.json(cc);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Um Centro de Custo com este código já existe.' }, { status: 400 });
    }
    console.error('Create CC error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Update CC
export async function PUT(req: Request) {
  try {
    const { id, description, contractName } = await req.json();

    if (!id || !contractName) {
      return NextResponse.json({ error: 'ID and Contract Name are required' }, { status: 400 });
    }

    const cName = contractName.trim().toUpperCase();

    // 1. Find or create Contract
    
    let contract = await prisma.contract.findFirst({
      where: { name: cName }
    });
    if (!contract) {
      try {
        contract = await prisma.contract.create({ data: { name: cName } });
      } catch (err: any) {
        if (err.code === 'P2002') {
          contract = await prisma.contract.findFirst({ where: { name: cName } });
        } else {
          throw err;
        }
      }
    }


    // 2. Find or create Operation for this Contract
    
    let operation = await prisma.operation.findFirst({ where: { contractId: contract?.id } });
    if (!operation && contract) {
      try {
        operation = await prisma.operation.create({
          data: {
            name: cName,
            contractId: contract.id
          }
        });
      } catch(err: any) {
        if (err.code === 'P2002') {
          operation = await prisma.operation.findFirst({ where: { contractId: contract.id } });
        } else {
          throw err;
        }
      }
    }
    
    if (!contract) throw new Error("Conflito de nome de contrato (tente verificar espaços em branco ou letras maiúsculas/minúsculas).");
    if (!operation) throw new Error("Falha ao resolver Operação");


    // 3. Update CostCenter
    const cc = await prisma.costCenter.update({
      where: { id },
      data: {
        description: description ? description.trim() : null,
        operationId: operation.id
      }
    });

    return NextResponse.json(cc);
  } catch (error: any) {
    console.error('Update CC error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Delete CC (Single or Bulk)
export async function DELETE(req: Request) {
  try {
    let ids: string[] = [];
    
    // First try to parse body for bulk delete
    try {
      const body = await req.json();
      if (body.ids && Array.isArray(body.ids)) {
        ids = body.ids;
      }
    } catch(e) {
      // Body might be empty, try searchParams
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');
      if (id) ids = [id];
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: 'IDs are required' }, { status: 400 });
    }

    // Prisma deleteMany might not throw P2003 reliably for each one if we want to return a specific error,
    // but in SQLite deleteMany will fail entirely if one fails. Let's just do a deleteMany.
    const result = await prisma.costCenter.deleteMany({
      where: { id: { in: ids } }
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Não é possível excluir alguns dos Centros de Custo selecionados pois existem registros financeiros, PA ou Rescisões vinculados a eles.' },
        { status: 400 }
      );
    }
    console.error('Delete CC error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
