const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function dump() {
  console.log('--- Iniciando dump dos dados do SQLite ---');
  const start = Date.now();

  const data = {};

  console.log('Exportando perfis e usuários...');
  data.profiles = await prisma.profile.findMany();
  data.users = await prisma.user.findMany();

  console.log('Exportando estrutura organizacional (Contratos, Operações, Centros de Custo, Cargos)...');
  data.contracts = await prisma.contract.findMany();
  data.operations = await prisma.operation.findMany();
  data.costCenters = await prisma.costCenter.findMany();
  data.roles = await prisma.role.findMany();

  console.log('Exportando colaboradores e listas ativas...');
  data.employees = await prisma.employee.findMany();
  data.importHistories = await prisma.importHistory.findMany();
  data.activeLists = await prisma.activeList.findMany();

  console.log('Exportando planejamento e histórico...');
  data.planVersions = await prisma.planVersion.findMany();
  data.planRecords = await prisma.planRecord.findMany();
  data.financialRecords = await prisma.financialRecord.findMany();
  data.variacaoRecords = await prisma.variacaoRecord.findMany();

  console.log('Exportando governança e auditoria...');
  data.batches = await prisma.forecastImportBatch.findMany();
  data.governanceRecords = await prisma.governanceRecord.findMany();
  data.governanceEvidences = await prisma.governanceEvidence.findMany();
  data.comments = await prisma.comment.findMany();
  data.logs = await prisma.log.findMany();

  const dumpPath = path.resolve(__dirname, '../prisma/sqlite_dump.json');
  fs.writeFileSync(dumpPath, JSON.stringify(data));

  const stats = fs.statSync(dumpPath);
  console.log(`\n✅ Dump concluído com sucesso em ${(Date.now() - start)}ms!`);
  console.log(`Arquivo salvo em: ${dumpPath} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`- Contratos: ${data.contracts.length}`);
  console.log(`- Centros de Custo: ${data.costCenters.length}`);
  console.log(`- Cargos: ${data.roles.length}`);
  console.log(`- Colaboradores: ${data.employees.length}`);
  console.log(`- Registros de Efetivo (ActiveList): ${data.activeLists.length}`);
  console.log(`- Registros de Planejamento (PlanRecord): ${data.planRecords.length}`);
  console.log(`- Registros Financeiros: ${data.financialRecords.length}`);
  console.log(`- Registros de Governança: ${data.governanceRecords.length}`);
}

dump()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
