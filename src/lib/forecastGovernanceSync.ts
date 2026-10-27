import prisma from '@/lib/prisma';

/**
 * Obtém a versão de Forecast vigente ou mais recente para o ano informado.
 */
export async function getActiveForecastVersion(yearInt: number) {
  let version = await prisma.planVersion.findFirst({
    where: { year: yearInt, type: 'FORECAST', status: 'VIGENTE' },
    orderBy: { createdAt: 'desc' }
  });

  if (!version) {
    version = await prisma.planVersion.findFirst({
      where: { year: yearInt, type: 'FORECAST' },
      orderBy: { createdAt: 'desc' }
    });
  }

  if (!version) {
    version = await prisma.planVersion.create({
      data: {
        type: 'FORECAST',
        year: yearInt,
        description: `Forecast ${yearInt}`,
        status: 'VIGENTE'
      }
    });
  }

  return version;
}

/**
 * Sincroniza a movimentação de Governança diretamente com a base de Forecast (PlanRecord),
 * garantindo que o Dashboard, a aba Administração e o Comparativo reflitam a alteração imediatamente.
 */
export async function syncGovernanceToForecast({
  competence,
  costCenterId,
  roleId,
  finalQuantity,
  justification
}: {
  competence: string;
  costCenterId: string;
  roleId: string;
  finalQuantity: number;
  justification?: string;
}) {
  if (!competence || !costCenterId || !roleId) return null;

  const year = competence.includes('/') ? competence.split('/')[1] : competence;
  const yearInt = parseInt(year, 10);
  const version = await getActiveForecastVersion(yearInt);

  const numericValue = Number(finalQuantity);

  return await prisma.planRecord.upsert({
    where: {
      versionId_costCenterId_roleId_competence: {
        versionId: version.id,
        costCenterId,
        roleId,
        competence
      }
    },
    update: {
      plannedFte: numericValue,
      adjustedFte: numericValue,
      ...(justification ? { justification } : {})
    },
    create: {
      versionId: version.id,
      costCenterId,
      roleId,
      competence,
      plannedFte: numericValue,
      adjustedFte: numericValue,
      justification: justification || null
    }
  });
}

/**
 * Reverte a quantidade do PlanRecord para a quantidade anterior quando uma alteração de Governança é excluída.
 */
export async function revertGovernanceFromForecast({
  competence,
  costCenterId,
  roleId,
  previousQuantity
}: {
  competence: string;
  costCenterId: string;
  roleId: string;
  previousQuantity: number;
}) {
  if (!competence || !costCenterId || !roleId) return null;

  const year = competence.includes('/') ? competence.split('/')[1] : competence;
  const yearInt = parseInt(year, 10);
  const version = await getActiveForecastVersion(yearInt);

  const numericValue = Number(previousQuantity);

  return await prisma.planRecord.upsert({
    where: {
      versionId_costCenterId_roleId_competence: {
        versionId: version.id,
        costCenterId,
        roleId,
        competence
      }
    },
    update: {
      plannedFte: numericValue,
      adjustedFte: numericValue
    },
    create: {
      versionId: version.id,
      costCenterId,
      roleId,
      competence,
      plannedFte: numericValue,
      adjustedFte: numericValue
    }
  });
}
