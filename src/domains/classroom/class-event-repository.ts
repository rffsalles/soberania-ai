import { Prisma, type ClassEventActor, type ClassEventType } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/api/domain-error';
import type { SessionPhase } from './class-state';

export const CLASS_EVENTS_PAGE = 200;

export type NewClassEvent = {
  type: ClassEventType;
  stepIndex: number | null;
  payload: Prisma.InputJsonValue;
  audience: string;
  createdBy: ClassEventActor;
};

export type ClassEventRow = {
  seq: number;
  type: ClassEventType;
  stepIndex: number | null;
  payload: Prisma.JsonValue;
  audience: string;
  createdBy: ClassEventActor;
  createdAt: Date;
};

export type AppendContext = { phase: SessionPhase; currentStepIndex: number | null };

const ROW_SELECT = {
  seq: true,
  type: true,
  stepIndex: true,
  payload: true,
  audience: true,
  createdBy: true,
  createdAt: true,
} as const;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

async function appendOnce(
  agendaId: string,
  build: (ctx: AppendContext) => NewClassEvent[],
): Promise<ClassEventRow[]> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM agendas WHERE id = ${agendaId} FOR UPDATE`;
    if (locked.length === 0) throw new DomainError(404, 'Agenda não encontrada.');

    const lastSession = await tx.classEvent.findFirst({
      where: { agendaId, audience: 'ALL', type: { in: ['SESSION_STARTED', 'SESSION_ENDED'] } },
      orderBy: { seq: 'desc' },
      select: { type: true },
    });
    const lastStep = await tx.classEvent.findFirst({
      where: { agendaId, audience: 'ALL', type: 'STEP_CHANGED' },
      orderBy: { seq: 'desc' },
      select: { stepIndex: true },
    });
    const phase: SessionPhase = !lastSession
      ? 'NOT_STARTED'
      : lastSession.type === 'SESSION_STARTED'
        ? 'RUNNING'
        : 'ENDED';

    const events = build({ phase, currentStepIndex: lastStep?.stepIndex ?? null });
    if (events.length === 0) return [];

    const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
      SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM class_events WHERE "agendaId" = ${agendaId}`;
    const first = Number(next);

    const rows: ClassEventRow[] = [];
    for (const [i, ev] of events.entries()) {
      rows.push(
        await tx.classEvent.create({
          data: { agendaId, seq: first + i, ...ev },
          select: ROW_SELECT,
        }),
      );
    }
    return rows;
  });
}

export async function appendEvents(
  agendaId: string,
  build: (ctx: AppendContext) => NewClassEvent[],
): Promise<ClassEventRow[]> {
  try {
    return await appendOnce(agendaId, build);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    return appendOnce(agendaId, build);
  }
}

export function findEventsAfter(
  agendaId: string,
  after: number,
  audiences: string[],
  limit: number,
): Promise<ClassEventRow[]> {
  return db.classEvent.findMany({
    where: { agendaId, seq: { gt: after }, audience: { in: audiences } },
    orderBy: { seq: 'asc' },
    take: limit,
    select: ROW_SELECT,
  });
}
