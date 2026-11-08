import { AgendaStatus, Role, type ClassEventActor, type Prisma } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import {
  getAgendaForUser,
  setAgendaStatus,
  type AgendaActor,
  type AgendaDTO,
} from '@/domains/agendas/services/agenda-service';
import { findAgendaById } from '@/domains/agendas/services/agenda-repository';
import { generateMinutesForAgenda } from '@/domains/pedagogy/services/minutes-service';
import { findLessonPlayerData } from '@/domains/teaching/services/lesson-plan-repository';
import { timeScriptSchema, type TimeScriptItem } from '@/domains/teaching/time-script';
import {
  appendEvents,
  findEventsAfter,
  hasEventUpTo,
  findLatestStepChanged,
  findStallEvents,
  CLASS_EVENTS_PAGE,
  TUTOR_EVENTS_SCAN,
  type ClassEventRow,
  type NewClassEvent,
} from './class-event-repository';
import { stepLabel } from './class-state';
import { stalledTutorStep, TUTOR_STALL_MS } from './tutor-policy';
import {
  TEACHER_WRITABLE_TYPES,
  audiencesFor,
  parseClassEvent,
  projectForStudent,
  type ClassEventDTO,
  type ClassEventTypeName,
} from './class-event-schema';

export const CLASS_END_MINUTES_WARNING =
  'Aula encerrada, mas não foi possível gerar as atas dos alunos. O erro foi registrado no servidor.';
export const CLASS_END_AGENDA_WARNING =
  'Aula encerrada, mas a agenda não foi marcada como concluída. Conclua pelo relatório da turma.';

export type TeacherEventInput = { type: string; stepIndex?: number; payload?: unknown };

export type ClassEventDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  findTimeScript(lessonPlanId: string): Promise<TimeScriptItem[]>;
  findStoredStatus(agendaId: string): Promise<AgendaStatus | null>;
  repo: {
    appendEvents: typeof appendEvents;
    findEventsAfter: typeof findEventsAfter;
    hasEventUpTo: typeof hasEventUpTo;
    findLatestStepChanged: typeof findLatestStepChanged;
    findStallEvents: typeof findStallEvents;
  };
  completeAgenda(agendaId: string, user: AgendaActor): Promise<{ minutesGenerated: boolean }>;
};

export type EventReader = { read(after: number): Promise<{ events: ClassEventDTO[]; lastSeq: number }> };

const defaultDeps: ClassEventDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  async findTimeScript(lessonPlanId) {
    const plan = await findLessonPlayerData(lessonPlanId);
    const parsed = timeScriptSchema.safeParse(plan?.timeScript);
    return parsed.success ? parsed.data : [];
  },
  async findStoredStatus(agendaId) {
    return (await findAgendaById(agendaId))?.status ?? null;
  },
  repo: { appendEvents, findEventsAfter, hasEventUpTo, findLatestStepChanged, findStallEvents },
  async completeAgenda(agendaId, user) {
    await setAgendaStatus(agendaId, user, AgendaStatus.COMPLETED);
    try {
      await generateMinutesForAgenda(agendaId, user);
      return { minutesGenerated: true };
    } catch (err) {
      console.error('[aula] falha ao gerar atas ao encerrar a aula', err);
      return { minutesGenerated: false };
    }
  },
};

function isTeacherRole(user: AgendaActor): boolean {
  return user.role === Role.TEACHER || user.role === Role.ADMIN;
}

function conflict(code: string, message: string): DomainError {
  return new DomainError(409, message, { code });
}

function badRequest(code: string, message: string): DomainError {
  return new DomainError(400, message, { code });
}

function stepEvent(
  script: TimeScriptItem[],
  stepIndex: number,
  fromStepIndex: number | null,
  extra: { createdBy?: ClassEventActor; audience?: string; videoSeconds?: number } = {},
): NewClassEvent {
  const item = script[stepIndex];
  return {
    type: 'STEP_CHANGED',
    stepIndex,
    payload: {
      activity: item.activity.trim().slice(0, 200) || stepLabel(stepIndex),
      timeRange: item.timeRange.slice(0, 40),
      fromStepIndex,
      ...(extra.videoSeconds !== undefined ? { videoSeconds: extra.videoSeconds } : {}),
    },
    audience: extra.audience ?? 'ALL',
    createdBy: extra.createdBy ?? 'TEACHER',
  };
}

/** Maior i com timeSeconds <= videoSeconds; null antes do primeiro passo. */
export function stepIndexAt(script: TimeScriptItem[], videoSeconds: number): number | null {
  let found: number | null = null;
  for (const [i, item] of script.entries()) {
    if (item.timeSeconds <= videoSeconds) found = i;
  }
  return found;
}

/**
 * Aula gravada (reprise, depois do fim da janela da agenda): registra o passo do vídeo de um aluno
 * (audience = o aluno, createdBy SYSTEM).
 */
export async function appendVideoStep(
  user: AgendaActor,
  agendaId: string,
  videoSeconds: number,
  deps: ClassEventDeps = defaultDeps,
): Promise<ClassEventDTO[]> {
  if (user.role !== Role.STUDENT) {
    throw new DomainError(403, 'Apenas alunos registram o avanço do vídeo.');
  }
  const agenda = await deps.getAgenda(agendaId, user);
  const stored = await deps.findStoredStatus(agendaId);
  if (stored === AgendaStatus.CANCELLED || stored === AgendaStatus.COMPLETED) {
    throw conflict('CLASS_ENDED', 'A aula já foi encerrada.');
  }
  // Só a reprise: durante e antes da janela a aula ainda pode acontecer ao vivo com a tutora do professor.
  if (!(Date.now() > Date.parse(agenda.endTime))) {
    throw conflict(
      'CLASS_NOT_OVER',
      'A aula ainda pode acontecer ao vivo; a tutora da gravação começa depois do horário da aula.',
    );
  }
  const script = agenda.lessonPlanId ? await deps.findTimeScript(agenda.lessonPlanId) : [];
  const i = stepIndexAt(script, videoSeconds);
  if (i === null) return [];

  const rows = await deps.repo.appendEvents(
    agendaId,
    ({ phase, audienceStepIndex }) => {
      if (phase === 'RUNNING') {
        throw conflict('LIVE_CLASS_IN_PROGRESS', 'A aula está acontecendo ao vivo; o roteiro segue o professor.');
      }
      if (phase === 'ENDED') throw conflict('CLASS_ENDED', 'A aula já foi encerrada.');
      if (audienceStepIndex === i) return [];
      return [
        stepEvent(script, i, audienceStepIndex, { createdBy: 'SYSTEM', audience: user.id, videoSeconds }),
      ];
    },
    { stepAudience: user.id },
  );
  return rows.map(toClassEventDTO);
}

export async function appendTeacherEvent(
  user: AgendaActor,
  agendaId: string,
  input: TeacherEventInput,
  deps: ClassEventDeps = defaultDeps,
): Promise<{ events: ClassEventDTO[]; warning: string | null }> {
  if (!isTeacherRole(user)) {
    throw new DomainError(403, 'Apenas o professor da aula pode registrar eventos.');
  }
  const agenda = await deps.getAgenda(agendaId, user);
  const stored = await deps.findStoredStatus(agendaId);
  if (stored === AgendaStatus.CANCELLED || stored === AgendaStatus.COMPLETED) {
    throw conflict('CLASS_ENDED', 'A aula já foi encerrada.');
  }
  if (!(TEACHER_WRITABLE_TYPES as readonly string[]).includes(input.type)) {
    throw badRequest('EVENT_TYPE_NOT_ALLOWED', 'Tipo de evento não permitido para o professor.');
  }
  const type = input.type as ClassEventTypeName;
  const needsScript = type === 'SESSION_STARTED' || type === 'STEP_CHANGED';
  const script = needsScript && agenda.lessonPlanId ? await deps.findTimeScript(agenda.lessonPlanId) : [];

  let notePayload: unknown;
  if (type === 'STEP_CHANGED') {
    const i = input.stepIndex;
    if (i === undefined || !Number.isInteger(i) || i < 0 || i >= script.length) {
      throw badRequest('STEP_OUT_OF_RANGE', 'O passo informado não existe no roteiro.');
    }
  } else if (type === 'TEACHER_NOTE') {
    const parsed = parseClassEvent(type, input.payload, input.stepIndex ?? null);
    if (!parsed.ok) throw badRequest('INVALID_EVENT', parsed.error);
    notePayload = parsed.payload;
  }

  const rows = await deps.repo.appendEvents(agendaId, ({ phase, currentStepIndex }) => {
    if (phase === 'ENDED') throw conflict('CLASS_ENDED', 'A aula já foi encerrada.');
    if (type === 'SESSION_STARTED') {
      if (phase === 'RUNNING') throw conflict('CLASS_ALREADY_STARTED', 'A aula já foi iniciada.');
      const started: NewClassEvent = {
        type,
        stepIndex: null,
        payload: {},
        audience: 'ALL',
        createdBy: 'TEACHER',
      };
      return script.length > 0 ? [started, stepEvent(script, 0, null)] : [started];
    }
    if (type === 'SESSION_ENDED') {
      if (phase === 'NOT_STARTED') throw conflict('CLASS_NOT_STARTED', 'A aula ainda não foi iniciada.');
      return [{ type, stepIndex: null, payload: {}, audience: 'ALL', createdBy: 'TEACHER' }];
    }
    if (type === 'STEP_CHANGED') {
      if (phase === 'NOT_STARTED') throw conflict('CLASS_NOT_STARTED', 'A aula ainda não foi iniciada.');
      return [stepEvent(script, input.stepIndex as number, currentStepIndex)];
    }
    return [
      {
        type,
        stepIndex: input.stepIndex ?? null,
        payload: notePayload as Prisma.InputJsonValue,
        audience: 'TEACHER',
        createdBy: 'TEACHER',
      },
    ];
  });

  let warning: string | null = null;
  if (type === 'SESSION_ENDED') {
    try {
      const { minutesGenerated } = await deps.completeAgenda(agendaId, user);
      if (!minutesGenerated) warning = CLASS_END_MINUTES_WARNING;
    } catch (err) {
      console.error('[aula] falha ao concluir a agenda após SESSION_ENDED', err);
      warning = CLASS_END_AGENDA_WARNING;
    }
  }
  return { events: rows.map(toClassEventDTO), warning };
}

/**
 * Fecha a aula quando a agenda foi concluída/cancelada por fora do painel:
 * grava SESSION_ENDED (SYSTEM) só se a aula está em andamento. Não conclui agenda nem gera atas.
 */
export async function closeClassIfRunning(
  agendaId: string,
  deps: ClassEventDeps = defaultDeps,
): Promise<boolean> {
  const rows = await deps.repo.appendEvents(agendaId, ({ phase }) =>
    phase === 'RUNNING'
      ? [{ type: 'SESSION_ENDED', stepIndex: null, payload: {}, audience: 'ALL', createdBy: 'SYSTEM' }]
      : [],
  );
  return rows.length > 0;
}

export function toClassEventDTO(row: ClassEventRow): ClassEventDTO {
  return {
    seq: row.seq,
    type: row.type,
    stepIndex: row.stepIndex,
    payload: row.payload,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Eventos da aula como o professor os vê (ALL + TEACHER), já validados: leitura de servidor da tutora. */
export async function readTutorEvents(agendaId: string): Promise<ClassEventDTO[]> {
  const rows = await findEventsAfter(agendaId, 0, ['ALL', 'TEACHER'], TUTOR_EVENTS_SCAN);
  const out: ClassEventDTO[] = [];
  for (const row of rows) {
    const parsed = parseClassEvent(row.type, row.payload, row.stepIndex);
    if (parsed.ok) out.push({ ...toClassEventDTO(row), payload: parsed.payload });
  }
  return out;
}

function readable(user: AgendaActor, rows: ClassEventRow[]): ClassEventDTO[] {
  const isStudent = !isTeacherRole(user);
  const out: ClassEventDTO[] = [];
  for (const row of rows) {
    const parsed = parseClassEvent(row.type, row.payload, row.stepIndex);
    if (!parsed.ok) {
      console.warn(`[aula] evento ${row.seq} com payload inválido descartado: ${parsed.error}`);
      continue;
    }
    const dto = { ...toClassEventDTO(row), payload: parsed.payload };
    out.push(isStudent ? projectForStudent(dto) : dto);
  }
  return out;
}

type PageReader = { readPage(after: number): Promise<{ events: ClassEventDTO[]; lastSeq: number }> };

async function openPageReader(user: AgendaActor, agendaId: string, deps: ClassEventDeps): Promise<PageReader> {
  await deps.getAgenda(agendaId, user);
  const audiences = audiencesFor(user);
  return {
    async readPage(after) {
      const rows = await deps.repo.findEventsAfter(agendaId, after, audiences, CLASS_EVENTS_PAGE);
      // O cursor avança pelas linhas cruas: linhas inválidas descartadas não podem travá-lo.
      const lastSeq = rows.reduce((max, r) => Math.max(max, r.seq), after);
      return { events: readable(user, rows), lastSeq };
    },
  };
}

export async function openEventReader(
  user: AgendaActor,
  agendaId: string,
  deps: ClassEventDeps = defaultDeps,
): Promise<EventReader> {
  const pages = await openPageReader(user, agendaId, deps);
  return { read: (after) => pages.readPage(after) };
}

export async function listEventsAfter(
  user: AgendaActor,
  agendaId: string,
  after: number,
  deps: ClassEventDeps = defaultDeps,
): Promise<{ events: ClassEventDTO[]; lastSeq: number; closed: boolean }> {
  const pages = await openPageReader(user, agendaId, deps);
  const page = await pages.readPage(after);
  return { ...page, closed: await isClassClosed(user, agendaId, page.lastSeq, deps) };
}

/** True quando a aula não aceita mais eventos: agenda concluída/cancelada ou SESSION_ENDED no cursor ou abaixo. */
export async function isClassClosed(
  user: AgendaActor,
  agendaId: string,
  after: number,
  deps: ClassEventDeps = defaultDeps,
): Promise<boolean> {
  await deps.getAgenda(agendaId, user);
  const stored = await deps.findStoredStatus(agendaId);
  if (stored === AgendaStatus.CANCELLED) return true;
  // COMPLETED respeita o cursor: quem ainda não viu o SESSION_ENDED precisa recebê-lo pelo stream.
  return deps.repo.hasEventUpTo(agendaId, 'SESSION_ENDED', after);
}

/**
 * Passo atual parado (sem cartão nem TUTOR_SKIPPED há mais de 20 s), ou null. Barata: sai antes de qualquer
 * outra consulta quando o último STEP_CHANGED é recente; qualquer falha só loga. O passo é o do leitor:
 * para o aluno vale também o STEP_CHANGED da própria aula gravada (audience = ele).
 */
export async function stalledTutorStepFor(
  user: AgendaActor,
  agendaId: string,
  now: number,
  deps: ClassEventDeps = defaultDeps,
): Promise<number | null> {
  try {
    const latest = await deps.repo.findLatestStepChanged(agendaId, audiencesFor(user));
    if (!latest || latest.stepIndex === null) return null;
    if (now - latest.createdAt.getTime() <= TUTOR_STALL_MS) return null;
    const rows = await deps.repo.findStallEvents(agendaId, latest.stepIndex);
    return stalledTutorStep([toClassEventDTO(latest), ...rows.map(toClassEventDTO)], now);
  } catch (err) {
    console.error('[aula] falha ao checar passo parado da tutora', err);
    return null;
  }
}
