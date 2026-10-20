import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type InteractionInput = Prisma.StudentInteractionUncheckedCreateInput;
export type InteractionRecord = Prisma.StudentInteractionGetPayload<object>;

export function createInteraction(data: InteractionInput): Promise<InteractionRecord> {
  return db.studentInteraction.create({ data });
}

export function listInteractionsByAgenda(agendaId: string): Promise<InteractionRecord[]> {
  return db.studentInteraction.findMany({ where: { agendaId }, orderBy: { createdAt: 'asc' } });
}
