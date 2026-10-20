import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ASSESSMENT_STATUS } from '@/lib/constants/teaching';

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
      status: true,
      teachingPlan: { select: { teacherId: true, subjectId: true } },
    },
  });
}

export function updateAssessmentById(id: string, data: Prisma.AssessmentUncheckedUpdateInput) {
  return db.assessment.update({ where: { id }, data });
}

export async function claimAssessmentForPublish(id: string): Promise<boolean> {
  const { count } = await db.assessment.updateMany({
    where: { id, status: ASSESSMENT_STATUS.DRAFT },
    data: { status: ASSESSMENT_STATUS.PUBLISHED },
  });
  return count === 1;
}
