import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export function createDraft(data: Prisma.DraftSubmissionUncheckedCreateInput) {
  return db.draftSubmission.create({ data });
}

export function listDraftsByStudent(agendaId: string, studentId: string) {
  return db.draftSubmission.findMany({
    where: { agendaId, studentId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, feedback: true, rubricScores: true, createdAt: true },
  });
}
