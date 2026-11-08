import { InteractionType, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { OPTION_KEYS } from '@/lib/constants/assessments';
import { getAgendaForUser, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import {
  countClassAnswers,
  insertClassAnswer,
  type InteractionInput,
} from '@/domains/pedagogy/services/interaction-repository';
import {
  findEventBySeq,
  findEventsAfter,
  TUTOR_EVENTS_SCAN,
  type ClassEventRow,
} from './class-event-repository';
import {
  audiencesFor,
  parseClassEvent,
  type AnswerResult,
  type PulseEntry,
  type TutorQuestionPayload,
} from './class-event-schema';

export type AnswerInput = { optionKey?: string; text?: string; videoSeconds?: number };

export type ClassAnswerDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  findEventBySeq: typeof findEventBySeq;
  findEventsAfter: typeof findEventsAfter;
  insertClassAnswer(data: InteractionInput & { classEventSeq: number }): Promise<'CREATED' | 'DUPLICATE'>;
  countClassAnswers: typeof countClassAnswers;
};

const defaultDeps: ClassAnswerDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  findEventBySeq,
  findEventsAfter,
  insertClassAnswer,
  countClassAnswers,
};

const NOT_FOUND = 'Pergunta não encontrada.';
const MAX_OPEN_ANSWER = 1000;

function questionPayload(row: ClassEventRow | null): TutorQuestionPayload | null {
  if (!row || row.type !== 'TUTOR_QUESTION') return null;
  const parsed = parseClassEvent(row.type, row.payload, row.stepIndex);
  return parsed.ok ? (parsed.payload as TutorQuestionPayload) : null;
}

function invalid(message: string): DomainError {
  return new DomainError(400, message, { code: 'INVALID_ANSWER' });
}

export async function answerTutorQuestion(
  user: AgendaActor,
  agendaId: string,
  seq: number,
  input: AnswerInput,
  deps: ClassAnswerDeps = defaultDeps,
): Promise<AnswerResult> {
  if (user.role !== Role.STUDENT) {
    throw new DomainError(403, 'Apenas alunos respondem às perguntas da tutora.');
  }
  const agenda = await deps.getAgenda(agendaId, user);
  const payload = questionPayload(await deps.findEventBySeq(agendaId, seq, audiencesFor(user)));
  if (!payload) throw new DomainError(404, NOT_FOUND);

  let questionText: string;
  let responseText: string;
  let wasCorrect: boolean | null = null;
  let result: AnswerResult;

  if (payload.kind === 'MULTIPLE_CHOICE') {
    const key = input.optionKey;
    const option = payload.question.options.find((o) => o.key === key);
    if (!key || !(OPTION_KEYS as readonly string[]).includes(key) || !option) {
      throw invalid('Escolha uma das alternativas.');
    }
    questionText = payload.question.enunciation;
    responseText = `${key}) ${option.text}`;
    wasCorrect = key === payload.question.correctKey;
    result = { wasCorrect, correctKey: payload.question.correctKey, rationale: payload.question.rationale };
  } else {
    const text = input.text?.trim() ?? '';
    if (text.length < 1 || text.length > MAX_OPEN_ANSWER) {
      throw invalid('Escreva uma resposta de até 1000 caracteres.');
    }
    questionText = payload.text;
    responseText = text;
    result = { wasCorrect: null, correctKey: null, rationale: null };
  }

  const outcome = await deps.insertClassAnswer({
    agendaId,
    studentId: user.id,
    type: InteractionType.SOCRATIC_CHALLENGE,
    isSocraticChallenge: true,
    questionText,
    responseText,
    wasCorrect,
    timestampInVideo: input.videoSeconds ?? null,
    agendaType: agenda.type,
    classEventSeq: seq,
  });
  if (outcome === 'DUPLICATE') {
    throw new DomainError(409, 'Você já respondeu esta pergunta.', { code: 'ALREADY_ANSWERED' });
  }
  return result;
}

export async function getClassPulse(
  user: AgendaActor,
  agendaId: string,
  deps: ClassAnswerDeps = defaultDeps,
): Promise<PulseEntry[]> {
  if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
    throw new DomainError(403, 'Apenas o professor vê o pulso da turma.');
  }
  await deps.getAgenda(agendaId, user);
  const rows = await deps.findEventsAfter(agendaId, 0, ['ALL'], TUTOR_EVENTS_SCAN);
  const questions: { row: ClassEventRow; payload: TutorQuestionPayload }[] = [];
  for (const row of rows) {
    const payload = questionPayload(row);
    if (payload && row.stepIndex !== null) questions.push({ row, payload });
  }
  if (questions.length === 0) return [];
  const counts = await deps.countClassAnswers(agendaId, questions.map((q) => q.row.seq));
  return questions.map(({ row, payload }) => {
    const c = counts.find((x) => x.seq === row.seq);
    return {
      seq: row.seq,
      stepIndex: row.stepIndex as number,
      kind: payload.kind,
      answered: c?.answered ?? 0,
      correct: payload.kind === 'OPEN' ? null : (c?.correct ?? 0),
    };
  });
}
