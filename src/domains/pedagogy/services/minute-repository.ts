import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

const minuteInclude = {
  student: { select: { name: true } },
  agenda: {
    select: {
      subject: true,
      subjectRef: { select: { discipline: { select: { name: true } } } },
      class: { select: { name: true } },
    },
  },
} satisfies Prisma.PedagogicalMinuteInclude;

export type MinuteRecord = Prisma.PedagogicalMinuteGetPayload<{
  include: typeof minuteInclude;
}>;
export type MinuteWhere = Prisma.PedagogicalMinuteWhereInput;
export type MinuteInput = Omit<Prisma.PedagogicalMinuteUncheckedCreateInput, 'id' | 'createdAt'>;

export function upsertMinute(data: MinuteInput): Promise<MinuteRecord> {
  const { agendaId, studentId, ...fields } = data;
  return db.pedagogicalMinute.upsert({
    where: { agendaId_studentId: { agendaId, studentId } },
    create: data,
    update: fields,
    include: minuteInclude,
  });
}

export function listMinutes(where: MinuteWhere): Promise<MinuteRecord[]> {
  return db.pedagogicalMinute.findMany({
    where,
    include: minuteInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export function findStudent(id: string): Promise<{ id: string; name: string; classId: string | null } | null> {
  return db.user.findUnique({
    where: { id },
    select: { id: true, name: true, classId: true },
  });
}
