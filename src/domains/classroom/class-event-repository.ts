import { Prisma, type ClassEventActor, type ClassEventType } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/api/domain-error';
import type { SessionPhase } from './class-state';
import { parseClassEvent } from './class-event-schema';

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

export type AppendContext = {
  phase: SessionPhase;
  currentStepIndex: number | null;
  /** stepIndex do último STEP_CHANGED com audience = options.stepAudience; null sem a opção. */
  audienceStepIndex: number | null;
};
export type AppendOptions = { stepAudience?: string };

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

type Tx = Prisma.TransactionClient;

async function lockAndReadState(tx: Tx, agendaId: string, stepAudience?: string): Promise<AppendContext> {
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
  let audienceStepIndex: number | null = null;
  if (stepAudience !== undefined) {
    const own = await tx.classEvent.findFirst({
      where: { agendaId, audience: stepAudience, type: 'STEP_CHANGED' },
      orderBy: { seq: 'desc' },
      select: { stepIndex: true },
    });
    audienceStepIndex = own?.stepIndex ?? null;
  }
  const phase: SessionPhase = !lastSession
    ? 'NOT_STARTED'
    : lastSession.type === 'SESSION_STARTED'
      ? 'RUNNING'
      : 'ENDED';
  return { phase, currentStepIndex: lastStep?.stepIndex ?? null, audienceStepIndex };
}

async function insertEvents(tx: Tx, agendaId: string, events: NewClassEvent[]): Promise<ClassEventRow[]> {
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
}

type AppendWork<T> = (tx: Tx, ctx: AppendContext) => Promise<{ value: T; events: NewClassEvent[] }>;

async function appendOnce<T>(
  agendaId: string,
  work: AppendWork<T>,
  options?: AppendOptions,
): Promise<{ value: T; rows: ClassEventRow[] }> {
  return db.$transaction(async (tx) => {
    const ctx = await lockAndReadState(tx, agendaId, options?.stepAudience);
    const { value, events } = await work(tx, ctx);
    if (events.length === 0) return { value, rows: [] };
    return { value, rows: await insertEvents(tx, agendaId, events) };
  });
}

/**
 * Como appendEvents, mas `work` roda na mesma transação (sob a trava da agenda) e pode gravar outras linhas.
 * P2002 repete a transação inteira uma vez: `work` roda de novo e o que a tentativa desfeita gravou não existe mais.
 */
export async function appendEventsWith<T>(
  agendaId: string,
  work: AppendWork<T>,
  options?: AppendOptions,
): Promise<{ value: T; rows: ClassEventRow[] }> {
  try {
    return await appendOnce(agendaId, work, options);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    return appendOnce(agendaId, work, options);
  }
}

export async function appendEvents(
  agendaId: string,
  build: (ctx: AppendContext) => NewClassEvent[],
  options?: AppendOptions,
): Promise<ClassEventRow[]> {
  const { rows } = await appendEventsWith(agendaId, async (_tx, ctx) => ({ value: null, events: build(ctx) }), options);
  return rows;
}

/** Quando a tutora falhou pela última vez em destravar o grupo (STALEMATE_FAILED), ou null. */
export async function findLastStalemateFailureAt(agendaId: string): Promise<Date | null> {
  const row = await db.classEvent.findFirst({
    where: {
      agendaId,
      type: 'TUTOR_SKIPPED',
      stepIndex: null,
      payload: { path: ['reason'], equals: 'STALEMATE_FAILED' },
    },
    orderBy: { seq: 'desc' },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

export async function appendStalemateFailure(agendaId: string): Promise<void> {
  await appendEvents(agendaId, () => [
    {
      type: 'TUTOR_SKIPPED',
      stepIndex: null,
      payload: { reason: 'STALEMATE_FAILED' },
      audience: 'TEACHER',
      createdBy: 'TUTOR',
    },
  ]);
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

export async function hasEventUpTo(agendaId: string, type: ClassEventType, upToSeq: number): Promise<boolean> {
  const row = await db.classEvent.findFirst({
    where: { agendaId, type, audience: 'ALL', seq: { lte: upToSeq } },
    select: { seq: true },
  });
  return row !== null;
}

/** Existe evento do tipo na aula, sem limite de seq (seq é INT4). */
export async function hasEvent(agendaId: string, type: ClassEventType): Promise<boolean> {
  const row = await db.classEvent.findFirst({
    where: { agendaId, type, audience: 'ALL' },
    select: { seq: true },
  });
  return row !== null;
}

export type TutorEventType = 'TUTOR_CARD' | 'TUTOR_QUESTION' | 'TUTOR_SKIPPED';
export type NewTutorEvent = {
  type: TutorEventType;
  payload: Prisma.InputJsonValue;
  audience: 'ALL' | 'TEACHER';
};

export const TUTOR_EVENTS_SCAN = 1000; // limite de leitura do worker em findEventsAfter

const TUTOR_TYPES: TutorEventType[] = ['TUTOR_CARD', 'TUTOR_QUESTION', 'TUTOR_SKIPPED'];

export function findTutorEventsForStep(agendaId: string, stepIndex: number): Promise<ClassEventRow[]> {
  return db.classEvent.findMany({
    where: { agendaId, stepIndex, type: { in: TUTOR_TYPES } },
    orderBy: { seq: 'asc' },
    select: ROW_SELECT,
  });
}

export async function findEventBySeq(
  agendaId: string,
  seq: number,
  audiences: string[],
): Promise<ClassEventRow | null> {
  return db.classEvent.findFirst({
    where: { agendaId, seq, audience: { in: audiences } },
    select: ROW_SELECT,
  });
}

export async function appendTutorEvents(
  agendaId: string,
  stepIndex: number,
  events: NewTutorEvent[],
): Promise<ClassEventRow[]> {
  // Valida na escrita: um payload inválido seria descartado em toda leitura e deixaria o passo "parado".
  events = events.map((e) => {
    const parsed = parseClassEvent(e.type, e.payload, stepIndex);
    if (!parsed.ok) {
      throw new DomainError(400, `Evento da tutora inválido (${e.type}): ${parsed.error}`, {
        code: 'INVALID_TUTOR_EVENT',
      });
    }
    return { ...e, payload: parsed.payload as Prisma.InputJsonValue };
  });
  const requested = events.map((e) => e.type);
  try {
    return await db.$transaction(async (tx) => {
      const ctx = await lockAndReadState(tx, agendaId);
      if (ctx.phase === 'ENDED') return [];

      const existing = await tx.classEvent.findMany({
        where: { agendaId, stepIndex, type: { in: TUTOR_TYPES } },
        orderBy: { seq: 'asc' },
        select: ROW_SELECT,
      });
      const have = new Map(existing.map((r) => [r.type, r]));
      const missing: NewClassEvent[] = [];
      const seen = new Set<TutorEventType>();
      for (const e of events) {
        if (have.has(e.type) || seen.has(e.type)) continue;
        seen.add(e.type);
        missing.push({ type: e.type, stepIndex, payload: e.payload, audience: e.audience, createdBy: 'TUTOR' });
      }
      const created = missing.length > 0 ? await insertEvents(tx, agendaId, missing) : [];
      const all = new Map(have);
      for (const r of created) all.set(r.type as TutorEventType, r);
      return requested.flatMap((t, i) => (requested.indexOf(t) === i && all.has(t) ? [all.get(t)!] : []));
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const rows = await findTutorEventsForStep(agendaId, stepIndex);
    return rows.filter((r) => requested.includes(r.type as TutorEventType));
  }
}

/** Último STEP_CHANGED visível às audiences (o passo atual do leitor), para a checagem barata de passo parado. */
export function findLatestStepChanged(agendaId: string, audiences: string[]): Promise<ClassEventRow | null> {
  return db.classEvent.findFirst({
    where: { agendaId, type: 'STEP_CHANGED', audience: { in: audiences } },
    orderBy: { seq: 'desc' },
    select: ROW_SELECT,
  });
}

/** SESSION_ENDED, notas do professor e eventos da tutora do passo: o necessário para decidir se o passo está parado. */
export function findStallEvents(agendaId: string, stepIndex: number): Promise<ClassEventRow[]> {
  return db.classEvent.findMany({
    where: {
      agendaId,
      OR: [{ type: { in: ['SESSION_ENDED', 'TEACHER_NOTE'] } }, { stepIndex, type: { in: TUTOR_TYPES } }],
    },
    orderBy: { seq: 'asc' },
    take: TUTOR_EVENTS_SCAN,
    select: ROW_SELECT,
  });
}
