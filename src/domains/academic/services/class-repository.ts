import { db } from '@/lib/db';
import type { CreateClassInput } from '@/lib/validators/admin.validator';

const classPublicSelect = { id: true, name: true, code: true, semester: true, year: true } as const;

export type ClassPublic = { id: string; name: string; code: string; semester: number; year: number };

export async function listClasses() {
  return db.class.findMany({
    select: { ...classPublicSelect, _count: { select: { students: true, subjects: true } } },
    orderBy: [{ year: 'desc' }, { semester: 'desc' }, { name: 'asc' }],
  });
}

export async function findClassById(id: string): Promise<ClassPublic | null> {
  return db.class.findUnique({ where: { id }, select: classPublicSelect });
}

export async function findClassByCode(code: string): Promise<ClassPublic | null> {
  return db.class.findUnique({ where: { code }, select: classPublicSelect });
}

export async function createClass(data: CreateClassInput): Promise<ClassPublic> {
  return db.class.create({ data, select: classPublicSelect });
}

export async function updateClass(id: string, data: CreateClassInput): Promise<ClassPublic> {
  return db.class.update({ where: { id }, data, select: classPublicSelect });
}
