const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const vrs = await prisma.variacaoRecord.findMany({ include: { costCenter: true } });
    const als = await prisma.activeList.findMany({ include: { costCenter: true }, take: 10 });
    console.log("Variacao CCs:", [...new Set(vrs.map(v => v.costCenter?.code).filter(c => c))]);
    console.log("ActiveList CCs:", [...new Set(als.map(v => v.costCenter?.code).filter(c => c))]);
}
main();
