import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

type DraftCreateInput = Omit<Prisma.DraftSubmissionUncheckedCreateInput, 'rubricScores'> & {
  rubricScores: Prisma.InputJsonValue | null;
};

export function createDraft({ rubricScores, ...data }: DraftCreateInput) {
  return db.draftSubmission.create({ data: { ...data, rubricScores: rubricScores ?? Prisma.DbNull } });
}

export async function listDraftsByStudent(agendaId: string, studentId: string) {
  const rows = await db.draftSubmission.findMany({
    where: { agendaId, studentId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, feedback: true, rubricScores: true, createdAt: true, aiFallback: true },
  });
  // Registros anteriores à coluna: feedback nulo também significa que a IA não avaliou.
  return rows.map(({ aiFallback, ...r }) => ({ ...r, fallback: aiFallback || r.feedback === null }));
}
