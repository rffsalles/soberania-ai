import { db } from '@/lib/db';

const classPublicSelect = { id: true, name: true, code: true, semester: true, year: true } as const;

export async function listClasses() {
  return db.class.findMany({
    select: classPublicSelect,
    orderBy: [{ year: 'desc' }, { semester: 'desc' }, { name: 'asc' }],
  });
}

export async function findClassById(id: string) {
  return db.class.findUnique({ where: { id }, select: classPublicSelect });
}
