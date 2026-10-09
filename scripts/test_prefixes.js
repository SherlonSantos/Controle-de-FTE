const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const vr = await prisma.variacaoRecord.findMany();
    const prefixes = [...new Set(vr.map(v => v.contractName.split('-')[0].replace(/\./g, '').trim()))];
    console.log("Variacao Prefixes:", prefixes);
}
main();
