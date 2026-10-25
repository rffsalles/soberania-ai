/**
 * Recalcula o nome de todos os períodos letivos a partir de código, ano, semestre e tipo
 * (formatPeriodName). Idempotente.
 *
 * Uso: npx tsx scripts/backfill-period-names.ts
 */
import { PrismaClient } from '@prisma/client';
import { formatPeriodName } from '../src/domains/academic/period-label';

async function main() {
  const prisma = new PrismaClient();
  try {
    const periods = await prisma.academicPeriod.findMany();
    let updated = 0;
    for (const p of periods) {
      const name = formatPeriodName(p);
      if (name === p.name) continue;
      await prisma.academicPeriod.update({ where: { id: p.id }, data: { name } });
      console.log(`${p.code}: "${p.name}" -> "${name}"`);
      updated++;
    }
    console.log(`Concluído: ${updated} de ${periods.length} períodos atualizados.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
