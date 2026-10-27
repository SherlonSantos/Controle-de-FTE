/**
 * Script de migração de dados do SQLite local (dev.db) para o Supabase (PostgreSQL).
 * 
 * Ordem topológica de inserção (respeitando chaves estrangeiras):
 * 1. Profile
 * 2. User
 * 3. Contract
 * 4. Operation
 * 5. CostCenter
 * 6. Role
 * 7. Employee
 * 8. ImportHistory
 * 9. ActiveList
 * 10. PlanVersion
 * 11. PlanRecord
 * 12. FinancialRecord
 * 13. VariacaoRecord
 * 14. ForecastImportBatch
 * 15. GovernanceRecord
 * 16. GovernanceEvidence
 * 17. Comment
 * 18. Log
 */

const { PrismaClient: PostgresPrismaClient } = require('@prisma/client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const sqlitePath = path.resolve(__dirname, '../prisma/dev.db');

function querySqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function migrate() {
  console.log('====================================================');
  console.log('   MIGRAÇÃO DE DADOS: SQLITE ➔ SUPABASE (POSTGRES)');
  console.log('====================================================\n');

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
    console.error('❌ ERRO: A variável DATABASE_URL ainda não aponta para o Supabase (PostgreSQL).');
    console.error('Configure o DATABASE_URL e DIRECT_URL no arquivo .env antes de executar a migração.');
    process.exit(1);
  }

  const pg = new PostgresPrismaClient();
  const sqlite = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);

  try {
    console.log('1. Testando conexão com Supabase...');
    await pg.$connect();
    console.log('✅ Conexão com Supabase estabelecida com sucesso!\n');

    // Ordem das tabelas a migrar
    const tables = [
      { name: 'Profile', model: pg.profile, batchSize: 50 },
      { name: 'User', model: pg.user, batchSize: 50 },
      { name: 'Contract', model: pg.contract, batchSize: 50 },
      { name: 'Operation', model: pg.operation, batchSize: 100 },
      { name: 'CostCenter', model: pg.costCenter, batchSize: 200 },
      { name: 'Role', model: pg.role, batchSize: 200 },
      { name: 'Employee', model: pg.employee, batchSize: 500 },
      { name: 'ImportHistory', model: pg.importHistory, batchSize: 200 },
      { name: 'ActiveList', model: pg.activeList, batchSize: 1000 },
      { name: 'PlanVersion', model: pg.planVersion, batchSize: 50 },
      { name: 'PlanRecord', model: pg.planRecord, batchSize: 1000 },
      { name: 'FinancialRecord', model: pg.financialRecord, batchSize: 1000 },
      { name: 'VariacaoRecord', model: pg.variacaoRecord, batchSize: 500 },
      { name: 'ForecastImportBatch', model: pg.forecastImportBatch, batchSize: 100 },
      { name: 'GovernanceRecord', model: pg.governanceRecord, batchSize: 500 },
      { name: 'GovernanceEvidence', model: pg.governanceEvidence, batchSize: 200 },
      { name: 'Comment', model: pg.comment, batchSize: 200 },
      { name: 'Log', model: pg.log, batchSize: 500 }
    ];

    for (const t of tables) {
      process.stdout.write(`Migrando ${t.name}... `);
      const rows = await querySqlite(sqlite, `SELECT * FROM "${t.name}"`);
      
      if (rows.length === 0) {
        console.log(`0 registros (vazio).`);
        continue;
      }

      // Converte booleans e dates para tipos corretos do Postgres
      const formattedRows = rows.map(r => {
        const item = { ...r };
        for (const [key, val] of Object.entries(item)) {
          if (key.endsWith('Date') || key === 'createdAt' || key === 'updatedAt' || key === 'importDate') {
            if (val) item[key] = new Date(val);
          }
          if (typeof val === 'number' && (key === 'active' || key === 'isOverhead' || key === 'hasEvidence' || key === 'evidenceChecked' || key === 'isNewRole' || key === 'isRemovedRole')) {
            item[key] = Boolean(val);
          }
        }
        return item;
      });

      const chunks = chunkArray(formattedRows, t.batchSize);
      let inserted = 0;

      for (const chunk of chunks) {
        await t.model.createMany({
          data: chunk,
          skipDuplicates: true
        });
        inserted += chunk.length;
      }

      console.log(`✅ ${inserted} de ${rows.length} registros migrados.`);
    }

    console.log('\n====================================================');
    console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO PARA O SUPABASE!');
    console.log('====================================================');

  } catch (err) {
    console.error('\n❌ Erro durante a migração:', err);
  } finally {
    sqlite.close();
    await pg.$disconnect();
  }
}

migrate();
