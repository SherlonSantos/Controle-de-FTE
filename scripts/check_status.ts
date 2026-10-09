import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Breakdown by status in 07/2026 ActiveList
  const stats = await prisma.activeList.groupBy({
    by: ['status'],
    where: { competence: '07/2026' },
    _count: { id: true }
  });
  console.log('Current status distribution in ActiveList 07/2026:');
  stats.forEach((s: any) => console.log(' ', JSON.stringify(s.status), ':', s._count.id));

  const totalNonRescisao = stats
    .filter((s: any) => s.status !== 'Rescisão')
    .reduce((acc: number, s: any) => acc + s._count.id, 0);
  console.log('\nTotal sem Rescisão:', totalNonRescisao);

  // Check if there's any status value that's not one of the 4 expected
  const unknownStatuses = stats.filter((s: any) => 
    !['Afastamento', 'Atividade Normal', 'Férias', 'Rescisão'].includes(s.status)
  );
  if (unknownStatuses.length > 0) {
    console.log('\nStatuses inesperados:');
    unknownStatuses.forEach((s: any) => console.log(' ', JSON.stringify(s.status), ':', s._count.id));
  } else {
    console.log('\nNenhum status inesperado.');
  }

  // Check if the original import (21:50) had more non-Rescisao
  // by looking at employees whose status the EMPLOYEE table says should be non-Rescisao
  const empStats = await prisma.employee.groupBy({
    by: ['status'],
    _count: { id: true }
  });
  console.log('\nEmployee table status distribution (global, not per-month):');
  empStats.forEach((s: any) => console.log(' ', JSON.stringify(s.status), ':', s._count.id));
  
  // Check who is in 07/2026 but doesn't have status in ActiveList matching employee
  const mismatch = await prisma.$queryRaw<any[]>`
    SELECT e.registration, e.name, e.status as emp_status, al.status as al_status
    FROM ActiveList al
    JOIN Employee e ON e.id = al.employeeId
    WHERE al.competence = '07/2026'
    AND al.status != e.status
    LIMIT 20
  `;
  console.log('\nRecords where ActiveList.status != Employee.status (first 20):', mismatch.length, 'found');
  mismatch.forEach((r: any) => console.log(' ', r.registration, '-', r.name, '| AL:', r.al_status, '| Emp:', r.emp_status));
}

main().catch(console.error).finally(() => prisma.$disconnect());
