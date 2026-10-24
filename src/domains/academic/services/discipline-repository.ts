import { db } from '@/lib/db';
import type { CreateDisciplineInput, UpdateDisciplineInput } from '@/lib/validators/admin.validator';

const disciplinePublicSelect = { id: true, courseId: true, code: true, name: true, description: true, workloadHours: true } as const;

export type DisciplinePublic = {
  id: string;
  courseId: string;
  code: string;
  name: string;
  description: string | null;
  workloadHours: number;
};

export async function listDisciplines(filter: { courseId?: string }) {
  return db.discipline.findMany({
    where: filter.courseId ? { courseId: filter.courseId } : {},
    select: {
      ...disciplinePublicSelect,
      course: { select: { id: true, name: true, code: true } },
      _count: { select: { offerings: true } },
    },
    orderBy: { code: 'asc' },
  });
}

export async function findDisciplineById(id: string): Promise<DisciplinePublic | null> {
  return db.discipline.findUnique({ where: { id }, select: disciplinePublicSelect });
}

export async function findDisciplineByCourseAndCode(courseId: string, code: string): Promise<DisciplinePublic | null> {
  return db.discipline.findUnique({ where: { courseId_code: { courseId, code } }, select: disciplinePublicSelect });
}

export async function createDiscipline(data: CreateDisciplineInput): Promise<DisciplinePublic> {
  return db.discipline.create({ data, select: disciplinePublicSelect });
}

export async function updateDiscipline(id: string, data: UpdateDisciplineInput): Promise<DisciplinePublic> {
  return db.discipline.update({ where: { id }, data, select: disciplinePublicSelect });
}
