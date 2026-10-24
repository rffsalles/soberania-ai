import type { AcademicLevel } from '@prisma/client';
import { db } from '@/lib/db';
import type { CreateClassInput } from '@/lib/validators/admin.validator';

const classSelect = {
  id: true,
  name: true,
  code: true,
  semester: true,
  courseId: true,
  academicPeriodId: true,
  course: { select: { id: true, name: true, code: true, academicLevel: true } },
  academicPeriod: { select: { id: true, name: true, code: true, year: true } },
} as const;

export type ClassPublic = {
  id: string;
  name: string;
  code: string;
  semester: number;
  courseId: string;
  academicPeriodId: string;
  course: { id: string; name: string; code: string; academicLevel: AcademicLevel };
  academicPeriod: { id: string; name: string; code: string; year: number };
};

export async function listClasses() {
  return db.class.findMany({
    select: { ...classSelect, _count: { select: { students: true, subjects: true } } },
    orderBy: [{ academicPeriod: { year: 'desc' } }, { semester: 'asc' }, { name: 'asc' }],
  });
}

export async function findClassById(id: string): Promise<ClassPublic | null> {
  return db.class.findUnique({ where: { id }, select: classSelect });
}

export async function findClassByCode(code: string): Promise<ClassPublic | null> {
  return db.class.findUnique({ where: { code }, select: classSelect });
}

export async function createClass(data: CreateClassInput): Promise<ClassPublic> {
  return db.class.create({ data, select: classSelect });
}

export async function updateClass(id: string, data: CreateClassInput): Promise<ClassPublic> {
  return db.class.update({ where: { id }, data, select: classSelect });
}

/** Ofertas (disciplinas) já criadas para a turma. */
export async function countOfferings(classId: string): Promise<number> {
  return db.subject.count({ where: { classId } });
}
