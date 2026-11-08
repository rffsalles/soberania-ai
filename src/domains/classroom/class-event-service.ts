import { AgendaStatus, Role, type Prisma } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import {
  getAgendaForUser,
  setAgendaStatus,
  type AgendaActor,
  type AgendaDTO,
} from '@/domains/agendas/services/agenda-service';
import { generateMinutesForAgenda } from '@/domains/pedagogy/services/minutes-service';
import { findLessonPlayerData } from '@/domains/teaching/services/lesson-plan-repository';
import { timeScriptSchema, type TimeScriptItem } from '@/domains/teaching/time-script';
import {
  appendEvents,
  findEventsAfter,
  CLASS_EVENTS_PAGE,
  type ClassEventRow,
  type NewClassEvent,
} from './class-event-repository';
import {
  TEACHER_WRITABLE_TYPES,
  audiencesFor,
  parseClassEvent,
  projectForStudent,
  type ClassEventDTO,
  type ClassEventTypeName,
} from './class-event-schema';

export type TeacherEventInput = { type: string; stepIndex?: number; payload?: unknown };

export type ClassEventDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  findTimeScript(lessonPlanId: string): Promise<TimeScriptItem[]>;
  repo: { appendEvents: typeof appendEvents; findEventsAfter: typeof findEventsAfter };
  completeAgenda(agendaId: string, user: AgendaActor): Promise<void>;
};

export type EventReader = { read(after: number): Promise<{ events: ClassEventDTO[]; lastSeq: number }> };

const defaultDeps: ClassEventDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  async findTimeScript(lessonPlanId) {
    const plan = await findLessonPlayerData(lessonPlanId);
    const parsed = timeScriptSchema.safeParse(plan?.timeScript);
    return parsed.success ? parsed.data : [];
  },
  repo: { appendEvents, findEventsAfter },
  async completeAgenda(agendaId, user) {
    await setAgendaStatus(agendaId, user, AgendaStatus.COMPLETED);
    try {
      await generateMinutesForAgenda(agendaId, user);
    } catch (err) {
      console.error('[aula] falha ao gerar atas ao encerrar a aula', err);
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
): NewClassEvent {
  const item = script[stepIndex];
  return {
    type: 'STEP_CHANGED',
    stepIndex,
    payload: { activity: item.activity, timeRange: item.timeRange, fromStepIndex },
    audience: 'ALL',
    createdBy: 'TEACHER',
  };
}

export async function appendTeacherEvent(
  user: AgendaActor,
  agendaId: string,
  input: TeacherEventInput,
  deps: ClassEventDeps = defaultDeps,
): Promise<ClassEventDTO[]> {
  if (!isTeacherRole(user)) {
    throw new DomainError(403, 'Apenas o professor da aula pode registrar eventos.');
  }
  const agenda = await deps.getAgenda(agendaId, user);
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

  if (type === 'SESSION_ENDED') {
    try {
      await deps.completeAgenda(agendaId, user);
    } catch (err) {
      console.error('[aula] falha ao concluir a agenda após SESSION_ENDED', err);
    }
  }
  return rows.map(toDTO);
}

function toDTO(row: ClassEventRow): ClassEventDTO {
  return {
    seq: row.seq,
    type: row.type,
    stepIndex: row.stepIndex,
    payload: row.payload,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
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
    const dto = { ...toDTO(row), payload: parsed.payload };
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
): Promise<{ events: ClassEventDTO[]; lastSeq: number }> {
  const pages = await openPageReader(user, agendaId, deps);
  return pages.readPage(after);
}
