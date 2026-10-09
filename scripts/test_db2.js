const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const ccList = await prisma.costCenter.findMany();
    console.log("CostCenters total:", ccList.length);
    console.log("Sample CCs:", ccList.slice(0, 5).map(c => c.code));
    
    // Check lengths of CC codes
    const lengths = [...new Set(ccList.map(c => c.code.length))];
    console.log("CC Code lengths:", lengths);
}
main();
