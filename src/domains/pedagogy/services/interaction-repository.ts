import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type InteractionInput = Prisma.StudentInteractionUncheckedCreateInput;
export type InteractionRecord = Prisma.StudentInteractionGetPayload<object>;

export function createInteraction(data: InteractionInput): Promise<InteractionRecord> {
  return db.studentInteraction.create({ data });
}

export function listInteractionsByAgendaAndStudent(agendaId: string, studentId: string): Promise<InteractionRecord[]> {
  return db.studentInteraction.findMany({ where: { agendaId, studentId }, orderBy: { createdAt: 'asc' } });
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
  return db.studentInteraction.findMany({ where: { agendaId }, orderBy: { createdAt: 'asc' } });
}
