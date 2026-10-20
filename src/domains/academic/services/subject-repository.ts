import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

const teacherPublicSelect = { id: true, name: true, email: true, enrollment: true } as const;

const subjectWithTeachers = {
  teacherAssignments: { include: { teacher: { select: teacherPublicSelect } } },
} as const;

export type SubjectData = Omit<Prisma.SubjectCreateInput, 'teacherAssignments'>;

export function listSubjects() {
  return db.subject.findMany({
    include: {
      ...subjectWithTeachers,
      teachingPlans: { select: { id: true, status: true, updatedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export function createSubjectWithTeachers(data: SubjectData, teacherIds: string[]) {
  return db.subject.create({
    data: {
      ...data,
      teacherAssignments: { create: teacherIds.map((teacherId) => ({ teacherId })) },
    },
    include: subjectWithTeachers,
  });
}

/** Atomically updates the subject and re-syncs its N:N teacher assignments. */
export async function replaceSubjectTeachers(id: string, data: SubjectData, teacherIds: string[]) {
  const [, subject] = await db.$transaction([
    db.teacherSubject.deleteMany({ where: { subjectId: id } }),
    db.subject.update({
      where: { id },
      data: {
        ...data,
        teacherAssignments: { create: teacherIds.map((teacherId) => ({ teacherId })) },
      },
      include: subjectWithTeachers,
    }),
  ]);
  return subject;
}
