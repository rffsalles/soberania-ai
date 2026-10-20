import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { aiProvider } from '@/lib/ai-provider';
import type { AIMessage, AICompletionOptions, StreamChunk } from '@/lib/ai-provider';
import { getAgendaForUser, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { findTeacherSubjectIds } from '@/domains/agendas/services/agenda-repository';
import {
  buildFallbackMinutesText,
  buildMinutesMessages,
  parseMinutesText,
  type MinutesPromptInput,
  type MinutesText,
} from '@/domains/agents/prompts/minutes-prompt';
import { computeMetrics, type MetricInteraction } from '../minute-metrics';
import type { ClassMinuteData } from '../types';
import * as minuteRepo from './minute-repository';
import * as interactionRepo from './interaction-repository';
import type { MinuteRecord, MinuteWhere } from './minute-repository';

export type MinuteDTO = ClassMinuteData & {
  subjectName: string;
  className: string;
};

export type MinuteFilter = {
  agendaId?: string;
  studentId?: string;
  subjectId?: string;
  classId?: string;
  from?: string;
  to?: string;
};

export type MinutesDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  findStudent: typeof minuteRepo.findStudent;
  listInteractions(agendaId: string, studentId: string): Promise<MetricInteraction[]>;
  listStudentIds(agendaId: string): Promise<string[]>;
  findTeacherSubjectIds(teacherId: string): Promise<string[]>;
  upsertMinute: typeof minuteRepo.upsertMinute;
  listMinutes(where: MinuteWhere): Promise<MinuteRecord[]>;
  streamChat(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk>;
  now: () => Date;
};

const defaultDeps: MinutesDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  findStudent: minuteRepo.findStudent,
  listInteractions: interactionRepo.listInteractionsByAgendaAndStudent,
  listStudentIds: interactionRepo.listStudentIdsWithInteractions,
  findTeacherSubjectIds,
  upsertMinute: minuteRepo.upsertMinute,
  listMinutes: minuteRepo.listMinutes,
  streamChat: (messages, options) => aiProvider.streamChat(messages, options),
  now: () => new Date(),
};

const MINUTE_TEMPERATURE = 0.3;
const MINUTE_MAX_TOKENS = 400;
const MINUTES_BATCH_SIZE = 4;

function toDTO(r: MinuteRecord): MinuteDTO {
  return {
    id: r.id,
    agendaId: r.agendaId,
    sessionTitle: r.sessionTitle,
    studentId: r.studentId,
    studentName: r.student.name,
    engagementScore: r.engagementScore,
    hesitationIndex: r.hesitationIndex,
    topicsMastered: r.topicsMastered,
    topicsStruggled: r.topicsStruggled,
    totalQuestionsAsked: r.totalQuestionsAsked,
    socraticChallengesAnswered: r.socraticChallengesAnswered,
    rawSummary: r.rawSummary,
    actionableAdvice: r.actionableAdvice,
    createdAt: r.createdAt.toISOString(),
    subjectName: r.agenda.subjectRef?.name ?? r.agenda.subject,
    className: r.agenda.class.name,
  };
}

async function writeMinuteText(input: MinutesPromptInput, deps: MinutesDeps): Promise<MinutesText> {
  const fallback = buildFallbackMinutesText(input);
  try {
    let text = '';
    let usedFallback = false;
    for await (const chunk of deps.streamChat(buildMinutesMessages(input), {
      temperature: MINUTE_TEMPERATURE,
      maxTokens: MINUTE_MAX_TOKENS,
    })) {
      text += chunk.token;
      if (chunk.fallback) usedFallback = true;
    }
    if (usedFallback) return fallback;
    return parseMinutesText(text) ?? fallback;
  } catch (err) {
    console.warn('[minutes] falha ao redigir texto da ata, usando fallback', err);
    return fallback;
  }
}

export async function generateMinute(
  user: AgendaActor,
  input: { agendaId: string; studentId?: string },
  deps: MinutesDeps = defaultDeps
): Promise<MinuteDTO> {
  const studentId = input.studentId ?? user.id;
  if (user.role === Role.STUDENT && studentId !== user.id) {
    throw new DomainError(403, 'Estudantes só podem gerar a própria ata.');
  }
  const agenda = await deps.getAgenda(input.agendaId, user);
  const student = await deps.findStudent(studentId);
  if (!student || student.classId !== agenda.classId) {
    throw new DomainError(404, 'Estudante não encontrado nesta agenda.');
  }

  const metrics = computeMetrics(await deps.listInteractions(agenda.id, studentId));
  const text = await writeMinuteText(
    {
      sessionTitle: agenda.title,
      studentName: student.name,
      engagementScore: metrics.engagementScore,
      hesitationIndex: metrics.hesitationIndex,
      totalQuestionsAsked: metrics.totalQuestionsAsked,
      socraticChallengesAnswered: metrics.socraticChallengesAnswered,
      topicsMastered: metrics.topicsMastered,
      topicsStruggled: metrics.topicsStruggled,
    },
    deps
  );

  const record = await deps.upsertMinute({
    agendaId: agenda.id,
    studentId,
    sessionTitle: agenda.title,
    engagementScore: metrics.engagementScore,
    hesitationIndex: metrics.hesitationIndex,
    topicsMastered: metrics.topicsMastered,
    topicsStruggled: metrics.topicsStruggled,
    totalQuestionsAsked: metrics.totalQuestionsAsked,
    socraticChallengesAnswered: metrics.socraticChallengesAnswered,
    rawSummary: text.rawSummary,
    actionableAdvice: text.actionableAdvice,
  });
  return toDTO(record);
}

export type AgendaMinutesResult = {
  generated: number;
  failed: { studentId: string; error: string }[];
};

export async function generateMinutesForAgenda(
  agendaId: string,
  user: AgendaActor,
  deps: MinutesDeps = defaultDeps
): Promise<AgendaMinutesResult> {
  const result: AgendaMinutesResult = { generated: 0, failed: [] };
  const studentIds = await deps.listStudentIds(agendaId);
  for (let i = 0; i < studentIds.length; i += MINUTES_BATCH_SIZE) {
    const batch = studentIds.slice(i, i + MINUTES_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((studentId) => generateMinute(user, { agendaId, studentId }, deps))
    );
    settled.forEach((outcome, idx) => {
      if (outcome.status === 'fulfilled') {
        result.generated += 1;
      } else {
        const reason: unknown = outcome.reason;
        result.failed.push({
          studentId: batch[idx],
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    });
  }
  return result;
}

async function scopeWhere(user: AgendaActor, deps: MinutesDeps): Promise<MinuteWhere> {
  if (user.role === Role.ADMIN) return {};
  if (user.role === Role.TEACHER) {
    const subjectIds = await deps.findTeacherSubjectIds(user.id);
    return {
      agenda: {
        OR: [{ subjectId: { in: subjectIds } }, { teacherId: user.id }],
      },
    };
  }
  return { studentId: user.id };
}

export async function listMinutes(
  user: AgendaActor,
  filter: MinuteFilter,
  deps: MinutesDeps = defaultDeps
): Promise<MinuteDTO[]> {
  const conditions: MinuteWhere[] = [await scopeWhere(user, deps)];
  if (filter.agendaId) conditions.push({ agendaId: filter.agendaId });
  if (user.role !== Role.STUDENT && filter.studentId) conditions.push({ studentId: filter.studentId });
  if (filter.subjectId) conditions.push({ agenda: { subjectId: filter.subjectId } });
  if (filter.classId) conditions.push({ agenda: { classId: filter.classId } });
  if (filter.from || filter.to) {
    conditions.push({
      createdAt: {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      },
    });
  }
  return (await deps.listMinutes({ AND: conditions })).map(toDTO);
}
