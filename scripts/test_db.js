const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const vr = await prisma.variacaoRecord.findMany({ include: { costCenter: true } });
    console.log("VariacaoRecord total:", vr.length);
    console.log("VariacaoRecord with CC:", vr.filter(v => v.costCenter).length);
    if (vr.length > 0) {
        console.log("Sample 1:", vr[0].contractName, " -> CC:", vr[0].costCenter?.code);
        console.log("Sample 2:", vr[1]?.contractName, " -> CC:", vr[1]?.costCenter?.code);
    }
}
main();
