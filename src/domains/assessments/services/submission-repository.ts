import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export function findSubmission(agendaId: string, studentId: string) {
  return db.examSubmission.findUnique({
    where: { agendaId_studentId: { agendaId, studentId } },
    select: { score: true, maxScore: true, submittedAt: true },
  });
}

export function createSubmission(data: Prisma.ExamSubmissionUncheckedCreateInput) {
  return db.examSubmission.create({ data });
}

export function listSubmissionsByAgenda(agendaId: string) {
  return db.examSubmission.findMany({ where: { agendaId }, orderBy: { submittedAt: 'asc' } });
}
