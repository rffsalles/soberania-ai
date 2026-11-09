import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { appendEventsWith } from '@/domains/classroom/class-event-repository';
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

function groupMessageEvent(msg: StudyGroupMessageRecord, isAi: boolean) {
  return {
    type: 'GROUP_MESSAGE',
    stepIndex: null,
    payload: { messageId: msg.id },
    audience: 'ALL',
    createdBy: isAi ? 'TUTOR' : 'SYSTEM',
  } as const;
}

/** Grava a mensagem e o evento GROUP_MESSAGE na mesma transação. */
export async function createMessage(data: NewStudyGroupMessage): Promise<StudyGroupMessageRecord> {
  const { value } = await appendEventsWith(data.agendaId, async (tx) => {
    const msg = await tx.studyGroupMessage.create({ data, include: messageInclude });
    return { value: msg, events: [groupMessageEvent(msg, data.isAi)] };
  });
  return value;
}

/** Como createMessage, mas só grava se a última mensagem da agenda ainda for `expectedLastId` (lida sob a trava). */
export async function createMessageIfLast(
  data: NewStudyGroupMessage,
  expectedLastId: string,
): Promise<StudyGroupMessageRecord | null> {
  const { value } = await appendEventsWith(data.agendaId, async (tx) => {
    const last = await tx.studyGroupMessage.findFirst({
      where: { agendaId: data.agendaId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (last?.id !== expectedLastId) return { value: null, events: [] };
    const msg = await tx.studyGroupMessage.create({ data, include: messageInclude });
    return { value: msg, events: [groupMessageEvent(msg, data.isAi)] };
  });
  return value;
}

export function findLastMessage(agendaId: string): Promise<StudyGroupMessageRecord | null> {
  return db.studyGroupMessage.findFirst({
    where: { agendaId },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
  });
}
