const { Client } = require('pg');

const regions = [
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1'
];

async function testRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const connectionString = `postgresql://postgres.penyvofoigflocgklcam:Sherlon.131069@${host}:5432/postgres`;
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query('SELECT NOW()');
    await client.end();
    return { region, host, success: true, time: res.rows[0].now };
  } catch (err) {
    await client.end().catch(() => {});
    return { region, host, success: false, error: err.message };
  }
}

async function main() {
  console.log('Testando regiões do Supabase para o projeto penyvofoigflocgklcam...\n');
  for (const r of regions) {
    process.stdout.write(`Testando ${r}... `);
    const res = await testRegion(r);
    if (res.success) {
      console.log(`✅ CONECTADO COM SUCESSO!`);
      console.log(`Região: ${res.region}`);
      console.log(`Host Pooler: ${res.host}`);
      console.log(`Horário do Servidor: ${res.time}`);
      return;
    } else {
      console.log(`Falhou (${res.error})`);
    }
  }
}

main();
