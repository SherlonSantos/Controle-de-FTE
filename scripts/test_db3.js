const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const ccList = await prisma.costCenter.findMany({
        where: { code: { startsWith: '1101' } }
    });
    for(const c of ccList) {
        console.log("CC:", c.code, "| desc:", c.description);
    }
}
main();
