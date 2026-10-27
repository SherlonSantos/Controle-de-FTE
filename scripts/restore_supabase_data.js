const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function parseDates(items, dateFields) {
  return items.map(item => {
    const copy = { ...item };
    for (const f of dateFields) {
      if (copy[f]) copy[f] = new Date(copy[f]);
    }
    return copy;
  });
}

async function restore() {
  console.log('====================================================');
  console.log('   RESTAURAÇÃO DE DADOS PARA O SUPABASE (POSTGRES)');
  console.log('====================================================\n');

  const dumpPath = path.resolve(__dirname, '../prisma/sqlite_dump.json');
  if (!fs.existsSync(dumpPath)) {
    console.error(`❌ Arquivo de dump não encontrado: ${dumpPath}`);
    process.exit(1);
  }

  console.log('Lendo arquivo de backup (40 MB)...');
  const raw = fs.readFileSync(dumpPath, 'utf-8');
  const data = JSON.parse(raw);
  console.log('✅ Arquivo carregado na memória com sucesso!\n');

  try {
    console.log('Conectando ao Supabase...');
    await prisma.$connect();
    console.log('✅ Conexão estabelecida!\n');

    // 1. Profiles & Users
    if (data.profiles?.length) {
      console.log(`Inserindo Profiles (${data.profiles.length})...`);
      const items = parseDates(data.profiles, ['createdAt', 'updatedAt']);
      await prisma.profile.createMany({ data: items, skipDuplicates: true });
    }

    if (data.users?.length) {
      console.log(`Inserindo Users (${data.users.length})...`);
      const items = parseDates(data.users, ['createdAt', 'updatedAt']);
      await prisma.user.createMany({ data: items, skipDuplicates: true });
    }

    // 2. Contracts, Operations, CostCenters, Roles
    if (data.contracts?.length) {
      console.log(`Inserindo Contracts (${data.contracts.length})...`);
      const items = parseDates(data.contracts, ['createdAt', 'updatedAt', 'demobilizationDate']);
      await prisma.contract.createMany({ data: items, skipDuplicates: true });
    }

    if (data.operations?.length) {
      console.log(`Inserindo Operations (${data.operations.length})...`);
      const items = parseDates(data.operations, ['createdAt', 'updatedAt']);
      await prisma.operation.createMany({ data: items, skipDuplicates: true });
    }

    if (data.costCenters?.length) {
      console.log(`Inserindo CostCenters (${data.costCenters.length})...`);
      const items = parseDates(data.costCenters, ['createdAt', 'updatedAt']);
      const chunks = chunkArray(items, 500);
      for (const c of chunks) {
        await prisma.costCenter.createMany({ data: c, skipDuplicates: true });
      }
    }

    if (data.roles?.length) {
      console.log(`Inserindo Roles (${data.roles.length})...`);
      const items = parseDates(data.roles, ['createdAt', 'updatedAt']);
      const chunks = chunkArray(items, 500);
      for (const c of chunks) {
        await prisma.role.createMany({ data: c, skipDuplicates: true });
      }
    }

    // 3. Employees, ImportHistories, ActiveLists
    if (data.employees?.length) {
      console.log(`Inserindo Employees (${data.employees.length})...`);
      const items = parseDates(data.employees, ['createdAt', 'updatedAt', 'admissionDate', 'terminationDate']);
      const chunks = chunkArray(items, 1000);
      for (const c of chunks) {
        await prisma.employee.createMany({ data: c, skipDuplicates: true });
      }
    }

    if (data.importHistories?.length) {
      console.log(`Inserindo ImportHistories (${data.importHistories.length})...`);
      const items = parseDates(data.importHistories, ['createdAt', 'importDate']);
      await prisma.importHistory.createMany({ data: items, skipDuplicates: true });
    }

    if (data.activeLists?.length) {
      console.log(`Inserindo ActiveLists (${data.activeLists.length})...`);
      const items = parseDates(data.activeLists, ['createdAt']);
      const chunks = chunkArray(items, 1000);
      let count = 0;
      for (const c of chunks) {
        await prisma.activeList.createMany({ data: c, skipDuplicates: true });
        count += c.length;
        process.stdout.write(`\r- ActiveLists: ${count} / ${data.activeLists.length}`);
      }
      console.log('');
    }

    // 4. PlanVersions, PlanRecords, FinancialRecords, VariacaoRecords
    if (data.planVersions?.length) {
      console.log(`Inserindo PlanVersions (${data.planVersions.length})...`);
      const items = parseDates(data.planVersions, ['createdAt', 'updatedAt']);
      await prisma.planVersion.createMany({ data: items, skipDuplicates: true });
    }

    if (data.planRecords?.length) {
      console.log(`Inserindo PlanRecords (${data.planRecords.length})...`);
      const items = parseDates(data.planRecords, ['createdAt', 'updatedAt']);
      const chunks = chunkArray(items, 1000);
      let count = 0;
      for (const c of chunks) {
        await prisma.planRecord.createMany({ data: c, skipDuplicates: true });
        count += c.length;
        process.stdout.write(`\r- PlanRecords: ${count} / ${data.planRecords.length}`);
      }
      console.log('');
    }

    if (data.financialRecords?.length) {
      console.log(`Inserindo FinancialRecords (${data.financialRecords.length})...`);
      const items = parseDates(data.financialRecords, ['createdAt', 'updatedAt']);
      const chunks = chunkArray(items, 1000);
      let count = 0;
      for (const c of chunks) {
        await prisma.financialRecord.createMany({ data: c, skipDuplicates: true });
        count += c.length;
        process.stdout.write(`\r- FinancialRecords: ${count} / ${data.financialRecords.length}`);
      }
      console.log('');
    }

    if (data.variacaoRecords?.length) {
      console.log(`Inserindo VariacaoRecords (${data.variacaoRecords.length})...`);
      const items = parseDates(data.variacaoRecords, ['createdAt', 'updatedAt']);
      await prisma.variacaoRecord.createMany({ data: items, skipDuplicates: true });
    }

    // 5. Governance & Batches
    if (data.batches?.length) {
      console.log(`Inserindo ForecastImportBatches (${data.batches.length})...`);
      const items = parseDates(data.batches, ['createdAt']);
      await prisma.forecastImportBatch.createMany({ data: items, skipDuplicates: true });
    }

    if (data.governanceRecords?.length) {
      console.log(`Inserindo GovernanceRecords (${data.governanceRecords.length})...`);
      const items = parseDates(data.governanceRecords, ['createdAt', 'updatedAt', 'approvalDate', 'justificationDate']);
      await prisma.governanceRecord.createMany({ data: items, skipDuplicates: true });
    }

    if (data.governanceEvidences?.length) {
      console.log(`Inserindo GovernanceEvidences (${data.governanceEvidences.length})...`);
      const items = parseDates(data.governanceEvidences, ['createdAt']);
      await prisma.governanceEvidence.createMany({ data: items, skipDuplicates: true });
    }

    console.log('\n====================================================');
    console.log('🎉 TODOS OS DADOS FORAM MIGRADOS COM SUCESSO PARA O SUPABASE!');
    console.log('====================================================');

  } catch (err) {
    console.error('❌ Erro na inserção no Supabase:', err);
  } finally {
    await prisma.$disconnect();
  }
}

restore();
