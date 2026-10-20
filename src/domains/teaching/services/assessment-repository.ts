import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export function listAssessmentsByPlan(filter: { planId?: string; teacherId?: string }) {
  return db.assessment.findMany({
    where: {
      ...(filter.planId ? { teachingPlanId: filter.planId } : {}),
      ...(filter.teacherId ? { teachingPlan: { teacherId: filter.teacherId } } : {}),
    },
    include: { teachingPlan: { include: { subject: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export function createAssessment(data: Prisma.AssessmentUncheckedCreateInput) {
  return db.assessment.create({ data });
}

export function findAssessmentWithPlan(id: string) {
  return db.assessment.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      durationMinutes: true,
      teachingPlan: { select: { teacherId: true, subjectId: true } },
    },
  });
}

export function updateAssessmentById(id: string, data: Prisma.AssessmentUncheckedUpdateInput) {
  return db.assessment.update({ where: { id }, data });
}
