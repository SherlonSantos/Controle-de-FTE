const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const http = require('http');

const prisma = new PrismaClient();

function requestHttp(method, pathUrl, bodyData = null) {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(`http://localhost:3000${pathUrl}`);
    const postData = bodyData ? JSON.stringify(bodyData) : null;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          if (res.headers['content-type']?.includes('application/json')) {
            parsed = JSON.parse(body);
          }
        } catch (_) {}

        resolve({
          path: pathUrl,
          method: method,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
          bodyLength: body.length,
          contentType: res.headers['content-type'] || '',
          success: res.statusCode >= 200 && res.statusCode < 400,
          statusText: res.statusCode === 200 ? 'OK' : (res.statusCode === 400 ? 'Bad Request' : (res.statusCode === 405 ? 'Method Not Allowed' : 'HTTP ' + res.statusCode)),
          parsedSummary: parsed ? (Array.isArray(parsed) ? `Array[${parsed.length}]` : Object.keys(parsed).slice(0, 5).join(', ')) : undefined
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        path: pathUrl,
        method: method,
        statusCode: 0,
        error: err.message,
        durationMs: Date.now() - start,
        success: false
      });
    });

    req.setTimeout(8000, () => {
      req.destroy();
      resolve({
        path: pathUrl,
        method: method,
        statusCode: 408,
        error: 'Timeout',
        durationMs: 8000,
        success: false
      });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runDiagnostic() {
  const diagnostic = {};

  // 1. Ambiente
  const dbPath = path.resolve(__dirname, '../prisma/dev.db');
  const dbStat = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;

  diagnostic.sistema = {
    versaoNode: process.version,
    plataforma: process.platform,
    bancoDeDados: {
      arquivo: dbPath,
      tamanhoMB: dbStat ? (dbStat.size / (1024 * 1024)).toFixed(2) + ' MB' : 'Inexistente',
      ultimaModificacao: dbStat ? dbStat.mtime.toLocaleString('pt-BR') : null
    }
  };

  // 2. Volumes do Banco de Dados
  const [
    users, profiles, contracts, operations, costCenters, roles,
    employees, activeLists, planVersions, planRecords,
    financialRecords, variacaoRecords, governanceRecords, batches, evidences
  ] = await Promise.all([
    prisma.user.count(),
    prisma.profile.count(),
    prisma.contract.count(),
    prisma.operation.count(),
    prisma.costCenter.count(),
    prisma.role.count(),
    prisma.employee.count(),
    prisma.activeList.count(),
    prisma.planVersion.findMany(),
    prisma.planRecord.count(),
    prisma.financialRecord.count(),
    prisma.variacaoRecord.count(),
    prisma.governanceRecord.count(),
    prisma.forecastImportBatch.count(),
    prisma.governanceEvidence.count()
  ]);

  diagnostic.volumeDados = {
    usuarios: users,
    perfis: profiles,
    contratos: contracts,
    operacoes: operations,
    centrosDeCusto: costCenters,
    cargosMestres: roles,
    colaboradores: employees,
    efetivoRealizado_ActiveLists: activeLists,
    versoesPlanejamento: planVersions.length,
    registrosPlanejamento_PlanRecords: planRecords,
    registrosFinanceiros: financialRecords,
    registrosVariacao: variacaoRecords,
    registrosGovernanca: governanceRecords,
    lotesImportacaoForecast: batches,
    evidenciasGovernanca: evidences
  };

  // 3. Status das Versões de Planejamento (PA / Forecast)
  diagnostic.versoes = planVersions.map(v => ({
    id: v.id,
    tipo: v.type,
    ano: v.year,
    descricao: v.description,
    status: v.status,
    criadoEm: v.createdAt.toLocaleString('pt-BR')
  }));

  // 4. Análise de Inconsistências de Dados / Qualidade
  // 4.1 undefined/undefined em financialRecords
  const undefFin = await prisma.financialRecord.count({
    where: { competence: { contains: 'undefined' } }
  });

  // 4.2 Competências com formato não padrão (ex: 01/07/2026 em vez de 01/2026)
  const nonStandardPR = await prisma.planRecord.count({
    where: { competence: { contains: '/07/2026' } }
  });

  // 4.3 Registros órfãos via SQL
  const orphanPlanRecordsRole = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM PlanRecord pr
    WHERE pr.roleId NOT IN (SELECT id FROM Role)
  `;
  const orphanPlanRecordsCC = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM PlanRecord pr
    WHERE pr.costCenterId NOT IN (SELECT id FROM CostCenter)
  `;
  const orphanCostCentersOp = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM CostCenter cc
    WHERE cc.operationId NOT IN (SELECT id FROM Operation)
  `;
  const orphanOperationsCont = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM Operation op
    WHERE op.contractId NOT IN (SELECT id FROM Contract)
  `;
  const orphanGovContract = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM GovernanceRecord gr
    WHERE gr.contractId NOT IN (SELECT id FROM Contract)
  `;

  diagnostic.integridadeReferencial = {
    orfaos_PlanRecord_SemCargo: Number(orphanPlanRecordsRole[0]?.count || 0),
    orfaos_PlanRecord_SemCentroCusto: Number(orphanPlanRecordsCC[0]?.count || 0),
    orfaos_CentroCusto_SemOperacao: Number(orphanCostCentersOp[0]?.count || 0),
    orfaos_Operacao_SemContrato: Number(orphanOperationsCont[0]?.count || 0),
    orfaos_Governanca_SemContrato: Number(orphanGovContract[0]?.count || 0),
    inconsistenciasCompetenciaFinanceiro: undefFin,
    competenciasNaoPadraoPlanRecord: nonStandardPR
  };

  // 5. Módulo de Governança e Lotes
  const latestBatches = await prisma.forecastImportBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  diagnostic.governanca = {
    totalRegistros: governanceRecords,
    lotes: latestBatches.map(b => ({
      codigoLote: b.batchCode,
      arquivo: b.fileName,
      competencia: b.competence,
      totalProcessado: b.totalProcessed,
      totalDiferencas: b.diffCount,
      acrescimos: b.additionsCount,
      retiradas: b.withdrawalsCount,
      saldoLiquido: b.netDelta,
      pendentesJustificativa: b.pendingJustificationCount,
      dataCriacao: b.createdAt.toLocaleString('pt-BR')
    }))
  };

  // 6. Teste de Rotas do Servidor Dev (localhost:3000)
  const sampleRole = await prisma.role.findFirst();
  const sampleCC = await prisma.costCenter.findFirst();
  const sampleComp = '01/2026';

  const endpointsToTest = [
    { method: 'GET', url: '/', desc: 'Página Inicial / Dashboard' },
    { method: 'GET', url: '/governanca', desc: 'Página Governança de FTE' },
    { method: 'GET', url: '/comparativo', desc: 'Página Comparativo Detalhado' },
    { method: 'GET', url: '/importacao', desc: 'Página de Importação' },
    { method: 'GET', url: '/api/dashboard/filters', desc: 'API Filtros Dashboard' },
    { method: 'POST', url: '/api/dashboard/summary', body: { competences: [sampleComp] }, desc: 'API Resumo Dashboard (POST)' },
    { method: 'POST', url: '/api/dashboard/financial', body: { competences: [sampleComp] }, desc: 'API Financeiro Dashboard (POST)' },
    { method: 'GET', url: `/api/pa/summary?competence=${encodeURIComponent(sampleComp)}`, desc: 'API PA Summary' },
    { method: 'GET', url: `/api/forecast/summary?competence=${encodeURIComponent(sampleComp)}`, desc: 'API Forecast Summary' },
    { method: 'GET', url: `/api/financial/summary?competence=${encodeURIComponent(sampleComp)}`, desc: 'API Financial Summary' },
    { method: 'GET', url: `/api/variacao/summary?competence=${encodeURIComponent(sampleComp)}`, desc: 'API Variação Summary' },
    { method: 'GET', url: `/api/ativos/summary?competence=${encodeURIComponent(sampleComp)}`, desc: 'API Ativos Summary' },
    { method: 'GET', url: '/api/comparativo/filters', desc: 'API Filtros Comparativo' },
    { method: 'GET', url: '/api/costcenter/all', desc: 'API Centros de Custo (All)' },
    { method: 'GET', url: '/api/governanca', desc: 'API Listagem Governança' },
    { method: 'GET', url: '/api/governanca/pending-count', desc: 'API Contador Pendências Governança' },
    {
      method: 'GET',
      url: `/api/governanca/context?roleId=${sampleRole?.id || ''}&costCenterId=${sampleCC?.id || ''}&competence=${encodeURIComponent(sampleComp)}`,
      desc: 'API Contexto de Governança'
    }
  ];

  const results = [];
  for (const ep of endpointsToTest) {
    const res = await requestHttp(ep.method, ep.url, ep.body);
    results.push({
      descricao: ep.desc,
      rota: ep.url,
      metodo: ep.method,
      status: res.statusCode,
      sucesso: res.success,
      tempoResposta: `${res.durationMs}ms`,
      tamanhoRetorno: `${res.bodyLength} bytes`,
      detalhes: res.parsedSummary || (res.success ? 'HTML/Renderizado' : res.statusText)
    });
  }

  diagnostic.rotasServidor = results;

  await prisma.$disconnect();

  console.log(JSON.stringify(diagnostic, null, 2));
}

runDiagnostic().catch(console.error);
