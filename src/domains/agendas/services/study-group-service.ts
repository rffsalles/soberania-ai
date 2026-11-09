import { AgendaStatus, AgendaType } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import type { AgendaSession } from '@/domains/agendas/types';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';
import {
  chatWithTutor,
  type ChatHistoryMessage,
  type ChatInput,
  type ChatResult,
} from '@/domains/agents/services/chat-service';
import {
  STUDY_GROUP_CONTEXT_MESSAGES,
  STUDY_GROUP_STALEMATE_MINUTES,
  STUDY_GROUP_STALEMATE_RETRY_MS,
  TUTOR_DISPLAY_NAME,
  TUTOR_MENTION_PATTERN,
} from '@/lib/constants/tutor';
import { getAgendaForUser, type AgendaActor, type AgendaDTO } from './agenda-service';
import { findLastStalemateFailureAt, appendStalemateFailure } from '@/domains/classroom/class-event-repository';
import { isStalemateDue } from '@/domains/agendas/study-group-stalemate';
import * as realRepo from './study-group-repository';
import type { StudyGroupMessageRecord } from './study-group-repository';

export type MessageDTO = {
  id: string;
  agendaId: string;
  authorId: string | null;
  authorName: string;
  isAi: boolean;
  content: string;
  createdAt: string;
};

export type StudyGroupDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  repo: {
    listMessages(agendaId: string, since?: Date): Promise<StudyGroupMessageRecord[]>;
    listRecentMessages(agendaId: string, limit: number): Promise<StudyGroupMessageRecord[]>;
    createMessage(data: realRepo.NewStudyGroupMessage): Promise<StudyGroupMessageRecord>;
    findLastMessage(agendaId: string): Promise<StudyGroupMessageRecord | null>;
    createMessageIfLast(
      data: realRepo.NewStudyGroupMessage,
      expectedLastId: string
    ): Promise<StudyGroupMessageRecord | null>;
  };
  stalemate: {
    lastFailureAt(agendaId: string): Promise<Date | null>;
    recordFailure(agendaId: string): Promise<void>;
  };
  chatWithTutor(user: AgendaActor, input: ChatInput): Promise<Pick<ChatResult, 'reply' | 'fallback'>>;
  now: () => Date;
};

const defaultDeps: StudyGroupDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  repo: realRepo,
  stalemate: { lastFailureAt: findLastStalemateFailureAt, recordFailure: appendStalemateFailure },
  chatWithTutor: (user, input) => chatWithTutor(user, input),
  now: () => new Date(),
};

const NOT_STUDY_GROUP = 'Grupo de estudos não encontrado.';

function toDTO(m: StudyGroupMessageRecord): MessageDTO {
  return {
    id: m.id,
    agendaId: m.agendaId,
    authorId: m.authorId,
    authorName: m.isAi ? TUTOR_DISPLAY_NAME : (m.author?.name ?? ''),
    isAi: m.isAi,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  };
}

async function loadStudyGroup(agendaId: string, user: AgendaActor, deps: StudyGroupDeps): Promise<AgendaDTO> {
  const agenda = await deps.getAgenda(agendaId, user);
  if (agenda.type !== AgendaType.STUDY_GROUP) throw new DomainError(404, NOT_STUDY_GROUP);
  return agenda;
}

export function mentionsTutor(content: string): boolean {
  return TUTOR_MENTION_PATTERN.test(content);
}

function toHistory(messages: StudyGroupMessageRecord[]): ChatHistoryMessage[] {
  return messages.map((m) => ({ role: m.isAi ? 'assistant' : 'user', content: m.content }));
}

export async function listMessages(
  user: AgendaActor,
  agendaId: string,
  since?: Date,
  deps: StudyGroupDeps = defaultDeps
): Promise<MessageDTO[]> {
  await loadStudyGroup(agendaId, user, deps);
  return (await deps.repo.listMessages(agendaId, since)).map(toDTO);
}

export async function postMessage(
  user: AgendaActor,
  agendaId: string,
  content: string,
  deps: StudyGroupDeps = defaultDeps
): Promise<{ message: MessageDTO; tutorReply?: MessageDTO; /** true = menção à tutora sem IA disponível. */ tutorUnavailable?: true }> {
  const agenda = await loadStudyGroup(agendaId, user, deps);
  const window = validateAgendaTimeWindow(agenda as unknown as AgendaSession, deps.now());
  if (!window.isWithinWindow) throw new DomainError(422, window.message);

  const previous = await deps.repo.listRecentMessages(agendaId, STUDY_GROUP_CONTEXT_MESSAGES);
  const saved = await deps.repo.createMessage({ agendaId, authorId: user.id, content, isAi: false });
  const message = toDTO(saved);
  if (!mentionsTutor(content)) return { message };

  try {
    const { reply, fallback } = await deps.chatWithTutor(user, { agendaId, message: content, history: toHistory(previous) });
    // Sem IA real não há resposta da tutora a gravar: o aviso de indisponibilidade não é uma mensagem dela.
    if (fallback) return { message, tutorUnavailable: true };
    const tutorSaved = await deps.repo.createMessage({ agendaId, authorId: null, content: reply, isAi: true });
    return { message, tutorReply: toDTO(tutorSaved) };
  } catch (err) {
    // A mensagem humana já foi gravada: falha da tutora não pode invalidar o envio.
    console.warn('[study-group] tutora indisponível ao responder menção', err);
    return { message };
  }
}

/**
 * Se o grupo está LIVE e em silêncio há mais de STUDY_GROUP_STALEMATE_MINUTES após uma mensagem humana,
 * a Tutora faz uma pergunta socrática. Retorna a mensagem criada ou null.
 */
export async function checkStalemate(
  agendaId: string,
  user: AgendaActor,
  now: Date,
  deps: StudyGroupDeps = defaultDeps
): Promise<MessageDTO | null> {
  const agenda = await loadStudyGroup(agendaId, user, deps);
  if (agenda.status !== AgendaStatus.LIVE) return null;
  const last = await deps.repo.findLastMessage(agendaId);
  if (!last || !isStalemateDue(last, user.id, now.getTime())) return null;
  const failedAt = await deps.stalemate.lastFailureAt(agendaId);
  if (failedAt && now.getTime() - failedAt.getTime() < STUDY_GROUP_STALEMATE_RETRY_MS) return null;

  const recent = await deps.repo.listRecentMessages(agendaId, STUDY_GROUP_CONTEXT_MESSAGES);
  const prompt =
    `O grupo está em silêncio há mais de ${STUDY_GROUP_STALEMATE_MINUTES} minutos. ` +
    `Faça uma pergunta socrática curta para destravar a discussão sobre: ${agenda.title}`;
  let result: Pick<ChatResult, 'reply' | 'fallback'>;
  try {
    result = await deps.chatWithTutor(user, {
      agendaId,
      message: prompt,
      history: toHistory(recent),
      persistInteraction: false,
    });
  } catch (err) {
    await recordFailureSafely(agendaId, deps);
    throw err;
  }
  if (result.fallback) {
    await recordFailureSafely(agendaId, deps);
    return null;
  }
  // Outra mensagem pode ter chegado durante a geração: a checagem acontece dentro da trava da agenda.
  const saved = await deps.repo.createMessageIfLast(
    { agendaId, authorId: null, content: result.reply, isAi: true },
    last.id
  );
  return saved ? toDTO(saved) : null;
}

async function recordFailureSafely(agendaId: string, deps: StudyGroupDeps): Promise<void> {
  try {
    await deps.stalemate.recordFailure(agendaId);
  } catch (err) {
    console.warn('[study-group] não foi possível registrar a falha da intervenção', err);
  }
}
