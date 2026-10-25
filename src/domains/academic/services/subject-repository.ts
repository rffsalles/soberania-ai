import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

const teacherPublicSelect = { id: true, name: true, email: true, enrollment: true } as const;

const subjectWithTeachers = {
  teacherAssignments: { include: { teacher: { select: teacherPublicSelect } } },
} as const;

export type OfferingData = { disciplineId: string; classId: string };

export async function listSubjects(where: Prisma.SubjectWhereInput) {
  return db.subject.findMany({
    where,
    include: {
      ...subjectWithTeachers,
      discipline: true,
      class: { include: { course: true, academicPeriod: true } },
      teachingPlans: { select: { id: true, status: true, updatedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findSubjectById(id: string): Promise<{ id: string; disciplineId: string; classId: string } | null> {
  return db.subject.findUnique({ where: { id }, select: { id: true, disciplineId: true, classId: true } });
}

export async function findSubjectWithWorkload(
  id: string
): Promise<{ id: string; discipline: { workloadHours: number } } | null> {
  return db.subject.findUnique({ where: { id }, select: { id: true, discipline: { select: { workloadHours: true } } } });
}

export async function findSubjectByDisciplineAndClass(disciplineId: string, classId: string): Promise<{ id: string } | null> {
  return db.subject.findUnique({
    where: { disciplineId_classId: { disciplineId, classId } },
    select: { id: true },
  });
}

export async function findOfferingContext(id: string): Promise<{
  discipline: { name: string; workloadHours: number };
  class: { course: { name: string }; academicPeriod: { name: string } };
} | null> {
  return db.subject.findUnique({
    where: { id },
    select: {
      discipline: { select: { name: true, workloadHours: true } },
      class: { select: { course: { select: { name: true } }, academicPeriod: { select: { name: true } } } },
    },
  });
}

export async function createSubjectWithTeachers(data: OfferingData, teacherIds: string[]) {
  return db.subject.create({
    data: {
      disciplineId: data.disciplineId,
      classId: data.classId,
      teacherAssignments: { create: teacherIds.map((teacherId) => ({ teacherId })) },
    },
    include: subjectWithTeachers,
  });
}

/** Atomically re-syncs the offering's N:N teacher assignments. */
export async function replaceSubjectTeachers(id: string, teacherIds: string[]) {
  const [, subject] = await db.$transaction([
    db.teacherSubject.deleteMany({ where: { subjectId: id } }),
    db.subject.update({
      where: { id },
      data: { teacherAssignments: { create: teacherIds.map((teacherId) => ({ teacherId })) } },
      include: subjectWithTeachers,
    }),
  ]);
  return subject;
}
