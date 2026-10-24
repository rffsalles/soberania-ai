import { db } from '@/lib/db';

export function listPeriods() {
  return db.academicPeriod.findMany({
    where: { isActive: true },
    orderBy: [{ year: 'desc' }, { semester: 'desc' }, { createdAt: 'desc' }],
  });
}

export function findPeriodByCode(code: string) {
  return db.academicPeriod.findUnique({ where: { code } });
}

export function findPeriodById(id: string) {
  return db.academicPeriod.findUnique({ where: { id } });
}

export function createPeriod(data: {
  name: string;
  code: string;
  year: number;
  semester: number | null;
  type: string;
}) {
  return db.academicPeriod.create({ data: { ...data, isActive: true } });
}
