import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

const subjectContext = {
  include: { discipline: true, class: { include: { course: true, academicPeriod: true } } },
} as const;

const planFull = {
  subject: subjectContext,
  schedules: { include: { lessonPlans: true } },
  assessments: true,
} as const;

const planBasic = { subject: subjectContext } as const;

export function findPlans(filter: { teacherId?: string; subjectId?: string }) {
  return db.teachingPlan.findMany({
    where: {
      ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
    },
    include: planFull,
    orderBy: { createdAt: 'desc' },
  });
}

export function findPlanById(id: string) {
  return db.teachingPlan.findUnique({ where: { id }, include: planFull });
}

export function insertPlan(data: Prisma.TeachingPlanUncheckedCreateInput) {
  return db.teachingPlan.create({ data, include: planBasic });
}

export function updatePlanById(id: string, data: Prisma.TeachingPlanUncheckedUpdateInput) {
  return db.teachingPlan.update({ where: { id }, data, include: planBasic });
}

export function findPlanOwner(id: string) {
  return db.teachingPlan.findUnique({ where: { id }, select: { id: true, teacherId: true } });
}

export function findPlanForAssessment(id: string) {
  return db.teachingPlan.findUnique({
    where: { id },
    select: { id: true, teacherId: true, subjectId: true, syllabus: true, unitsContent: true, subject: { select: { discipline: { select: { name: true } } } } },
  });
}
