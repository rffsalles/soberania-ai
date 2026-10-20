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
