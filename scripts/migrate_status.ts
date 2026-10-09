import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting fast batch migration of status from Employee to ActiveList...');

  // Use raw SQL for a single fast UPDATE joining Employee table
  const result = await prisma.$executeRaw`
    UPDATE "ActiveList"
    SET "status" = (
      SELECT "status" FROM "Employee" WHERE "Employee"."id" = "ActiveList"."employeeId"
    )
    WHERE "status" = 'Ativo'
  `;

  console.log(`Migration completed! Updated ${result} records via batch SQL.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
