const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const vr = await prisma.variacaoRecord.findMany({
        where: { contractName: { contains: 'CLI' } }
    });
    console.log("Variacao CLI:", vr.map(v => ({
        contractName: v.contractName,
        prefixExtracted: v.contractName.split('-')[0].replace(/\./g, '').trim(),
        valPa: v.valPa
    })));
}
main();
