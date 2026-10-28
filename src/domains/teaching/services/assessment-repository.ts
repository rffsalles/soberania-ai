import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ASSESSMENT_STATUS } from '@/lib/constants/teaching';

export function listAssessmentsByPlan(filter: { planId?: string; teacherId?: string }) {
  return db.assessment.findMany({
    where: {
      ...(filter.planId ? { teachingPlanId: filter.planId } : {}),
      ...(filter.teacherId ? { teachingPlan: { teacherId: filter.teacherId } } : {}),
    },
    include: {
      teachingPlan: { include: { subject: { include: { discipline: true } } } },
      agendas: { select: { id: true, classId: true, startTime: true, endTime: true } },
      chapters: { select: { chapterId: true } },
    },
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
      teachingPlan: { select: { id: true, teacherId: true, subjectId: true } },
    },
  });
}

export function findAssessmentById(id: string) {
  return db.assessment.findUnique({
    where: { id },
    select: { id: true, questions: true, maxScore: true, durationMinutes: true },
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

export async function listAgendaIdsByAssessment(assessmentId: string): Promise<string[]> {
  const agendas = await db.agenda.findMany({ where: { assessmentId }, select: { id: true } });
  return agendas.map((a) => a.id);
}

export function findAssessmentRubrics(id: string) {
  return db.assessment.findUnique({ where: { id }, select: { rubrics: true } });
}

/** Edita só uma prova em rascunho, numa transação: falso se ela já foi publicada (nada é gravado). */
export function updateDraftAssessment(
  id: string,
  data: Prisma.AssessmentUncheckedUpdateInput,
  chapterIds?: string[]
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.assessment.updateMany({ where: { id, status: ASSESSMENT_STATUS.DRAFT }, data });
    if (count === 0) return false;
    if (chapterIds !== undefined) {
      await tx.assessmentChapter.deleteMany({ where: { assessmentId: id } });
      await tx.assessmentChapter.createMany({ data: chapterIds.map((chapterId) => ({ assessmentId: id, chapterId })) });
    }
    return true;
  });
}
