import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { STUDY_GROUP_LIST_LIMIT } from '@/lib/constants/tutor';

const messageInclude = { author: { select: { name: true } } } satisfies Prisma.StudyGroupMessageInclude;

export type StudyGroupMessageRecord = Prisma.StudyGroupMessageGetPayload<{ include: typeof messageInclude }>;

export type NewStudyGroupMessage = {
  agendaId: string;
  authorId: string | null;
  content: string;
  isAi: boolean;
};

/** Mensagens em ordem cronológica; com `since`, apenas as posteriores a essa data. */
export function listMessages(
  agendaId: string,
  since?: Date,
  limit: number = STUDY_GROUP_LIST_LIMIT
): Promise<StudyGroupMessageRecord[]> {
  return db.studyGroupMessage.findMany({
    where: { agendaId, ...(since ? { createdAt: { gt: since } } : {}) },
    include: messageInclude,
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

/** As últimas `limit` mensagens, em ordem cronológica. */
export async function listRecentMessages(agendaId: string, limit: number): Promise<StudyGroupMessageRecord[]> {
  const rows = await db.studyGroupMessage.findMany({
    where: { agendaId },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.reverse();
}

export function createMessage(data: NewStudyGroupMessage): Promise<StudyGroupMessageRecord> {
  return db.studyGroupMessage.create({ data, include: messageInclude });
}

export function findLastMessage(agendaId: string): Promise<StudyGroupMessageRecord | null> {
  return db.studyGroupMessage.findFirst({
    where: { agendaId },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
  });
}
