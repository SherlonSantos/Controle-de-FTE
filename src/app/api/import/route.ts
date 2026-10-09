import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateBatchCode, processForecastVersionComparison } from '@/lib/forecastGovernanceEngine';

async function applyGovernanceToForecast(year: number) {
  const forecastVersion = await prisma.planVersion.findFirst({
    where: { year, type: 'FORECAST' },
    orderBy: { createdAt: 'desc' }
  });
  if (!forecastVersion) return;

  const yearSuffix = `/${year}`;
  const approvedGovs = await prisma.governanceRecord.findMany({
    where: {
      status: 'APROVADO',
      competence: { endsWith: yearSuffix }
    }
  });

  if (approvedGovs.length === 0) return;

  const govMap = new Map();
  for (const gov of approvedGovs) {
     const key = `${gov.competence}_${gov.costCenterId}_${gov.roleId}`;
     if (!govMap.has(key)) govMap.set(key, []);
     govMap.get(key).push(gov);
  }

  for (const [key, govs] of govMap.entries()) {
     const [competence, costCenterIdStr, roleIdStr] = key.split('_');
     const costCenterId = costCenterIdStr === 'null' ? null : costCenterIdStr;
     
     const planRecords = await prisma.planRecord.findMany({
       where: {
         competence,
         roleId: roleIdStr,
         costCenterId: costCenterId || undefined,
         versionId: forecastVersion.id
       }
     });

     if (planRecords.length === 0) continue;

     let delta = 0;
     let correcao = null;
     for (const g of govs) {
        if (g.type === 'ACRESCIMO') delta += g.movedQuantity;
        else if (g.type === 'RETIRADA') delta -= g.movedQuantity;
        else if (g.type === 'CORRECAO') correcao = g;
     }

     for (const pr of planRecords) {
        let newAdjustedFte = pr.plannedFte;
        if (!correcao) {
           newAdjustedFte += delta;
        } else {
           newAdjustedFte = correcao.movedQuantity;
        }

        await prisma.planRecord.update({
          where: { id: pr.id },
          data: { adjustedFte: newAdjustedFte }
        });
     }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, baseType, competence, importId, batch, validRecords, errorRecords, fileName } = body;

    if (action === 'createHistory') {
        let user = await prisma.user.findFirst();
        if (!user) {
          let profile = await prisma.profile.findFirst({ where: { name: 'Admin' }});
          if (!profile) profile = await prisma.profile.create({ data: { name: 'Admin' } });
          user = await prisma.user.create({ data: { name: 'Admin', email: 'admin@fte.com', passwordHash: 'dummy', profileId: profile.id } });
        }
        
        let batchId: string | undefined;
        let batchCode: string | undefined;
        let newPlanVersionId: string | undefined;

        if (baseType === 'FORECAST') {
            const year = parseInt(competence);
            // Count existing versions for this year to name V1, V2, V3...
            const existingVersions = await prisma.planVersion.findMany({
                where: { year, type: 'FORECAST' },
                orderBy: { createdAt: 'desc' }
            });

            // Mark previous versions as HISTORICO
            if (existingVersions.length > 0) {
                await prisma.planVersion.updateMany({
                    where: { year, type: 'FORECAST' },
                    data: { status: 'HISTORICO' }
                });
            }

            const nextVersionNum = existingVersions.length + 1;
            const newVersion = await prisma.planVersion.create({
                data: {
                    type: 'FORECAST',
                    year,
                    description: `Forecast ${year} - V${nextVersionNum}`,
                    status: 'VIGENTE'
                }
            });
            newPlanVersionId = newVersion.id;

            // Generate unique batch identifier
            batchCode = await generateBatchCode();
            const forecastBatch = await prisma.forecastImportBatch.create({
                data: {
                    batchCode,
                    fileName: fileName || `Forecast_${competence}.xlsx`,
                    competence: String(competence),
                    userId: user.id
                }
            });
            batchId = forecastBatch.id;
        } else if (baseType === 'PA') {
            const year = parseInt(competence);
            const version = await prisma.planVersion.findFirst({ where: { year, type: 'PA' } });
            if (version) {
                await prisma.planRecord.deleteMany({ where: { versionId: version.id } });
                console.log(`Deleted all PlanRecords for PA ${year}`);
            }
        } else if (baseType === 'FINANCEIRO') {
            await prisma.financialRecord.deleteMany({ where: { competence } });
            console.log(`Deleted all FinancialRecords for competence ${competence}`);
        } else if (baseType === 'ATIVOS') {
            await prisma.activeList.deleteMany({ where: { competence } });
            console.log(`Deleted all ActiveList records for competence ${competence}`);
        }

        const history = await prisma.importHistory.create({
          data: { 
            baseType, 
            competence, 
            status: 'PROCESSANDO', 
            validRecords: 0, 
            errorRecords: 0, 
            userId: user.id 
          }
        });

        return NextResponse.json({ 
          id: history.id, 
          batchId, 
          batchCode, 
          versionId: newPlanVersionId 
        });
      }

    if (action === 'processBatch') {
      let validCount = 0;

      let versionId: string | undefined = body.versionId;
      if (!versionId && (baseType === 'PA' || baseType === 'FORECAST')) {
         const year = parseInt(competence);
         let version = await prisma.planVersion.findFirst({ 
           where: { year, type: baseType },
           orderBy: { createdAt: 'desc' }
         });
         if (!version) {
             version = await prisma.planVersion.create({
                data: { type: baseType, year, description: `${baseType === 'PA' ? 'Planejamento Anual' : 'Forecast'} ${year}` }
             });
         }
         versionId = version.id;
      }

      for (const row of batch) {
         if (baseType === 'PA' || baseType === 'FORECAST') {
             const roleTitle = row['Descrição Cargo'] || row['Cargo'] || 'NÃO INFORMADO';
               if (roleTitle.toUpperCase().startsWith('TOTAL') || roleTitle.match(/^1.d./)) {
                  console.log('Skipping subtotal row in PA/FORECAST:', roleTitle);
                  continue;
               }
             let role = await prisma.role.findUnique({ where: { title: roleTitle } });
             if (!role) role = await prisma.role.create({ data: { title: roleTitle } });
             
             let rawCcCode = row['Código CC'] || row['Código do Centro de Custo'] || '999999';
             const ccCode = String(rawCcCode).trim().replace(/\./g, '');
             const ccDesc = row['Detalhe CC'] || row['Centro de Custo'] || 'NÃO INFORMADO';
             
             let costCenter = await prisma.costCenter.findUnique({ where: { code: ccCode } });
             if (!costCenter) {
                let defaultOp = await prisma.operation.findFirst({ where: { name: 'PENDENTE DE MAPEAMENTO' } });
                if (!defaultOp) {
                   let defaultContract = await prisma.contract.findUnique({ where: { name: 'PENDENTE DE MAPEAMENTO' } });
                   if (!defaultContract) defaultContract = await prisma.contract.create({ data: { name: 'PENDENTE DE MAPEAMENTO' } });
                   defaultOp = await prisma.operation.create({ data: { name: 'PENDENTE DE MAPEAMENTO', contractId: defaultContract.id } });
                }
                costCenter = await prisma.costCenter.create({
                   data: { code: ccCode, description: ccDesc, operationId: defaultOp.id }
                });
             }

             const months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
             let hasData = false;
             
             for (let i = 0; i < 12; i++) {
                const mLabel = months[i];
                const val = parseFloat(row[mLabel]);
                if (!isNaN(val)) {
                   hasData = true;
                   const mm = String(i + 1).padStart(2, '0');
                   const compStr = `${mm}/${competence}`; // competence here is the year "2026"
                   
                   await prisma.planRecord.upsert({
                      where: {
                         versionId_costCenterId_roleId_competence: {
                            versionId: versionId!,
                            costCenterId: costCenter.id,
                            roleId: role.id,
                            competence: compStr
                         }
                      },
                      update: { plannedFte: val },
                      create: {
                         versionId: versionId!,
                         costCenterId: costCenter.id,
                         roleId: role.id,
                         competence: compStr,
                         plannedFte: val
                      }
                   });
                }
             }
             if (hasData) validCount++;

         } else if (baseType === 'ATIVOS') {
             // ATIVOS
             const roleTitle = row['Cargo'] || 'NÃO INFORMADO';
               if (roleTitle.toUpperCase().startsWith('TOTAL') || roleTitle.match(/^1.d./)) {
                  console.log('Skipping subtotal row in ATIVOS:', roleTitle);
                  continue;
               }
               let role = await prisma.role.findUnique({ where: { title: roleTitle } });
             if (!role) {
               role = await prisma.role.create({ data: { title: roleTitle } });
             }
         
         let rawCcCode = row['Código do Centro de Custo'] || '999999';
         const ccCode = String(rawCcCode).trim().replace(/\./g, '');
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
         
         const registration = row['Matrícula'] ? String(row['Matrícula']).trim() : 'N/A';
         const name = row['Colaborador'] || 'NÃO INFORMADO';
         const cpf = row['CPF'];
         const status = row['Tipo de Situação'] || 'Ativo';
         
         if (!registration || registration === 'N/A' || registration === '') {
            console.warn(`[Import ATIVOS] Linha pulada - sem matrícula. Nome: ${name}, Situação: ${status}`);
            continue;
         }
         
         let employee = await prisma.employee.findUnique({ where: { registration } });
         if (!employee) {
            employee = await prisma.employee.create({
               data: { registration, name, cpf, status }
            });
         } else {
            // Only update name/cpf — status is now stored per-month in ActiveList
            if (employee.name !== name) {
               employee = await prisma.employee.update({
                  where: { id: employee.id },
                  data: { name }
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
               importId: importId,
               status: status  // Always update status for this specific month
            },
            create: {
               importId: importId,
               employeeId: employee.id,
               costCenterId: costCenter.id,
               roleId: role.id,
               competence: competence,
               status: status,
               fteValue: 1.0
            }
         });
         validCount++;
         } else if (baseType === 'FINANCEIRO') {
             const ccCodeDesc = String(row.costCenter).trim();
             const parts = ccCodeDesc.split(' - ');
             const ccCode = parts[0].trim().replace(/\./g, '');
             const ccDesc = parts.slice(1).join(' - ').trim() || 'NÃO INFORMADO';

             let costCenter = await prisma.costCenter.findUnique({ where: { code: ccCode } });
             if (!costCenter) {
                 let defaultOp = await prisma.operation.findFirst({ where: { name: 'PENDENTE DE MAPEAMENTO' } });
                 if (!defaultOp) {
                    let defaultContract = await prisma.contract.findUnique({ where: { name: 'PENDENTE DE MAPEAMENTO' } });
                    if (!defaultContract) defaultContract = await prisma.contract.create({ data: { name: 'PENDENTE DE MAPEAMENTO' } });
                    defaultOp = await prisma.operation.create({ data: { name: 'PENDENTE DE MAPEAMENTO', contractId: defaultContract.id } });
                 }
                 costCenter = await prisma.costCenter.create({
                    data: { code: ccCode, description: ccDesc, operationId: defaultOp.id }
                 });
             }

             await prisma.financialRecord.upsert({
                 where: {
                     costCenterId_type_metric_scenario_competence: {
                         costCenterId: costCenter.id,
                         type: row.type || 'Custo',
                         metric: row.metric,
                         scenario: row.scenario,
                         competence: row.competence
                     }
                 },
                 update: { value: row.value },
                 create: {
                     costCenterId: costCenter.id,
                     type: row.type || 'Custo',
                     metric: row.metric,
                     scenario: row.scenario,
                     competence: row.competence,
                     value: row.value
                 }
             });
             validCount++;
         } else if (baseType === 'VARIACAO') {
             const contractName = String(row.contractName).trim();
             let costCenterId: string | null = null;
             
             // Try to map to an existing cost center
             const parts = contractName.split(' - ');
             if (parts.length > 1) {
                 const ccCode = parts[0].trim().replace(/\./g, '');
                 const costCenter = await prisma.costCenter.findFirst({ where: { code: { startsWith: ccCode } } });
                 if (costCenter) {
                     costCenterId = costCenter.id;
                 }
             }

             await prisma.variacaoRecord.upsert({
                 where: {
                     contractName_competence: {
                         contractName: contractName,
                         competence: row.competence
                     }
                 },
                 update: {
                     costCenterId: costCenterId,
                     ftePa: row.ftePa,
                     valPa: row.valPa,
                     fteReal: row.fteReal,
                     valReal: row.valReal,
                     fteVar: row.fteVar,
                     valVar: row.valVar,
                     isOverhead: row.isOverhead
                 },
                 create: {
                     costCenterId: costCenterId,
                     contractName: contractName,
                     competence: row.competence,
                     ftePa: row.ftePa,
                     valPa: row.valPa,
                     fteReal: row.fteReal,
                     valReal: row.valReal,
                     fteVar: row.fteVar,
                     valVar: row.valVar,
                     isOverhead: row.isOverhead
                 }
             });
             validCount++;
         } else if (baseType === 'CC_CONTRATO') {
             const ccCode = String(row.id).trim().replace(/\./g, '');
             const ccDesc = row.centro_custo ? String(row.centro_custo).trim() : null;
             const contractName = row.contrato ? String(row.contrato).trim() : 'NÃO INFORMADO';

             if (!ccCode || ccCode === 'undefined' || ccCode === 'null') continue;

             let contract = await prisma.contract.findUnique({ where: { name: contractName } });
             if (!contract) contract = await prisma.contract.create({ data: { name: contractName } });

             let operation = await prisma.operation.findFirst({ where: { name: contractName, contractId: contract.id } });
             if (!operation) operation = await prisma.operation.create({ data: { name: contractName, contractId: contract.id } });

             const existingCostCenter = await prisma.costCenter.findUnique({ where: { code: ccCode } });
             
             if (existingCostCenter) {
                 await prisma.costCenter.update({
                     where: { code: ccCode },
                     data: { description: ccDesc, operationId: operation.id }
                 });
             } else {
                 await prisma.costCenter.create({
                     data: { code: ccCode, description: ccDesc, operationId: operation.id }
                 });
             }

             validCount++;
         }
      }
      return NextResponse.json({ success: true, count: validCount });
    }

    if (action === 'finishImport') {
      const history = await prisma.importHistory.update({
        where: { id: importId },
        data: {
          status: 'CONCLUIDO',
          validRecords,
          errorRecords
        }
      });
      
      let diffSummary = null;

      // Auto-apply governance and calculate automatic version comparison if FORECAST
      if (history.baseType === 'FORECAST') {
        const year = parseInt(history.competence || '0');
        const batchId = body.batchId;
        const versionId = body.versionId;
        const userId = history.userId;

        if (batchId && versionId) {
          diffSummary = await processForecastVersionComparison({
            year,
            newVersionId: versionId,
            batchId,
            userId
          });
        }

        await applyGovernanceToForecast(year);
      }

      return NextResponse.json({ success: true, diffSummary });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
