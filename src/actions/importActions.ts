"use server"

import prisma from '@/lib/prisma'

export async function createImportHistory(baseType: string, competence: string) {
  // Garantir que existe um admin padrão no DB
  let user = await prisma.user.findFirst();
  if (!user) {
    let profile = await prisma.profile.findFirst({ where: { name: 'Admin' }});
    if (!profile) {
      profile = await prisma.profile.create({ data: { name: 'Admin' } });
    }
    user = await prisma.user.create({
      data: {
        name: 'Administrador Padrão',
        email: 'admin@mro.com',
        passwordHash: 'admin123',
        profileId: profile.id
      }
    });
  }

  const history = await prisma.importHistory.create({
    data: {
      userId: user.id,
      baseType,
      competence,
      status: 'PROCESSANDO'
    }
  });

  return history.id;
}

export async function processActiveListBatch(importId: string, competence: string, batch: any[]) {
  try {
    let validCount = 0;
    
    // Processamento sequencial leve para manter a consistência com upserts
    for (const row of batch) {
       const roleTitle = row['Cargo'] || 'NÃO INFORMADO';
       let role = await prisma.role.findUnique({ where: { title: roleTitle } });
       if (!role) {
         role = await prisma.role.create({ data: { title: roleTitle } });
       }
       
       const ccCode = row['Código do Centro de Custo'] || '999999';
       const ccDesc = row['Centro de Custo'] || 'NÃO INFORMADO';
       
       let costCenter = await prisma.costCenter.findUnique({ where: { code: ccCode } });
       if (!costCenter) {
          let defaultOp = await prisma.operation.findFirst({ where: { name: 'PENDENTE DE MAPEAMENTO' } });
          if (!defaultOp) {
             let defaultContract = await prisma.contract.findUnique({ where: { name: 'PENDENTE DE MAPEAMENTO' } });
             if (!defaultContract) {
               defaultContract = await prisma.contract.create({ data: { name: 'PENDENTE DE MAPEAMENTO' } });
             }
             defaultOp = await prisma.operation.create({ data: { name: 'PENDENTE DE MAPEAMENTO', contractId: defaultContract.id } });
          }
          
          costCenter = await prisma.costCenter.create({
             data: { code: ccCode, description: ccDesc, operationId: defaultOp.id }
          });
       }
       
       const registration = row['Matrícula'] || 'N/A';
       const name = row['Colaborador'] || 'NÃO INFORMADO';
       const cpf = row['CPF'];
       const status = row['Tipo de Situação'] || 'Ativo';
       
       if (registration === 'N/A') continue;
       
       let employee = await prisma.employee.findUnique({ where: { registration } });
       if (!employee) {
          employee = await prisma.employee.create({
             data: { registration, name, cpf, status }
          });
       } else {
          if (employee.status !== status || employee.name !== name) {
             employee = await prisma.employee.update({
                where: { id: employee.id },
                data: { status, name }
             });
          }
       }
       
       await prisma.activeList.upsert({
          where: {
             employeeId_competence: {
                employeeId: employee.id,
                competence: competence
             }
          },
          update: {
             costCenterId: costCenter.id,
             roleId: role.id,
             importId: importId
          },
          create: {
             importId: importId,
             employeeId: employee.id,
             costCenterId: costCenter.id,
             roleId: role.id,
             competence: competence,
             fteValue: 1.0
          }
       });
       
       validCount++;
    }
    
    return { success: true, count: validCount };
  } catch (error: any) {
    console.error("Erro no processamento do lote:", error);
    return { success: false, error: error.message };
  }
}

export async function finishImport(importId: string, validRecords: number, errorRecords: number) {
  await prisma.importHistory.update({
    where: { id: importId },
    data: {
      status: 'CONCLUIDO',
      validRecords,
      errorRecords
    }
  });
}
