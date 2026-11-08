import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type InteractionInput = Prisma.StudentInteractionUncheckedCreateInput;
export type InteractionRecord = Prisma.StudentInteractionGetPayload<object>;

export function createInteraction(data: InteractionInput): Promise<InteractionRecord> {
  return db.studentInteraction.create({ data });
}

export type LastInteraction = { isSocraticChallenge: boolean; responseText: string; createdAt: Date };

/** Última interação persistida do aluno na agenda (fonte confiável do desafio a julgar). */
export function findLastInteraction(agendaId: string, studentId: string): Promise<LastInteraction | null> {
  return db.studentInteraction.findFirst({
    where: { agendaId, studentId, classEventSeq: null },
    orderBy: { createdAt: 'desc' },
    select: { isSocraticChallenge: true, responseText: true, createdAt: true },
  });
}

export function listInteractionsByAgendaAndStudent(agendaId: string, studentId: string): Promise<InteractionRecord[]> {
  return db.studentInteraction.findMany({
    where: { agendaId, studentId },
    orderBy: { createdAt: 'asc' },
  });
}

export function countInteractionsSince(agendaId: string, studentId: string, since: Date): Promise<number> {
  return db.studentInteraction.count({ where: { agendaId, studentId, createdAt: { gt: since } } });
}

export async function listStudentIdsWithInteractions(agendaId: string): Promise<string[]> {
  const rows = await db.studentInteraction.findMany({
    where: { agendaId },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  return rows.map((r) => r.studentId);
}

export function listInteractionsByAgenda(agendaId: string): Promise<InteractionRecord[]> {
  return db.studentInteraction.findMany({
    where: { agendaId, classEventSeq: null },
    orderBy: { createdAt: 'asc' },
  });
}

export type ChatHistoryRecord = Pick<
  InteractionRecord,
  'id' | 'questionText' | 'responseText' | 'ragSourceBook' | 'ragSourcePage' | 'guardrailBlocked' | 'createdAt'
>;

/** Últimas `limit` interações do aluno na agenda, da mais recente para a mais antiga. */
export function listRecentInteractions(agendaId: string, studentId: string, limit: number): Promise<ChatHistoryRecord[]> {
  return db.studentInteraction.findMany({
    where: { agendaId, studentId, classEventSeq: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      questionText: true,
      responseText: true,
      ragSourceBook: true,
      ragSourcePage: true,
      guardrailBlocked: true,
      createdAt: true,
    },
  });
}

/** Grava a resposta do aluno a uma pergunta da tutora; a segunda do mesmo aluno/pergunta vira 'DUPLICATE'. */
export async function insertClassAnswer(
  data: InteractionInput & { classEventSeq: number },
): Promise<'CREATED' | 'DUPLICATE'> {
  try {
    await db.studentInteraction.create({ data });
    return 'CREATED';
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'DUPLICATE';
    throw err;
  }
}

export async function countClassAnswers(
  agendaId: string,
  seqs: number[],
): Promise<{ seq: number; answered: number; correct: number }[]> {
  if (seqs.length === 0) return [];
  return db.$queryRaw<{ seq: number; answered: number; correct: number }[]>`
    SELECT "classEventSeq" AS seq, COUNT(*)::int AS answered, COUNT(*) FILTER (WHERE "wasCorrect")::int AS correct
    FROM student_interactions
    WHERE "agendaId" = ${agendaId} AND "classEventSeq" IN (${Prisma.join(seqs)})
    GROUP BY 1`;
}
