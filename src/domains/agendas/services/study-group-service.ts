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
  };
  chatWithTutor(user: AgendaActor, input: ChatInput): Promise<Pick<ChatResult, 'reply' | 'fallback'>>;
  now: () => Date;
};

const defaultDeps: StudyGroupDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  repo: realRepo,
  chatWithTutor: (user, input) => chatWithTutor(user, input),
  now: () => new Date(),
};

const NOT_STUDY_GROUP = 'Grupo de estudos não encontrado.';
const MS_PER_MINUTE = 60_000;

/** Agendas com intervenção em andamento neste processo (evita intervenções duplicadas). */
const stalemateInFlight = new Set<string>();

/** Última falha de intervenção por agenda: evita martelar o provider enquanto ele estiver indisponível. */
const stalemateFailedAt = new Map<string, number>();

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
): Promise<{ message: MessageDTO; tutorReply?: MessageDTO }> {
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
    if (fallback) return { message };
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
  if (stalemateInFlight.has(agendaId)) return null;
  const failedAt = stalemateFailedAt.get(agendaId);
  if (failedAt !== undefined && now.getTime() - failedAt < STUDY_GROUP_STALEMATE_RETRY_MS) return null;
  stalemateInFlight.add(agendaId);
  try {
    const created = await intervene(agenda, user, now, deps);
    stalemateFailedAt.delete(agendaId);
    return created;
  } catch (err) {
    stalemateFailedAt.set(agendaId, now.getTime());
    throw err;
  } finally {
    stalemateInFlight.delete(agendaId);
  }
}

async function intervene(
  agenda: AgendaDTO,
  user: AgendaActor,
  now: Date,
  deps: StudyGroupDeps
): Promise<MessageDTO | null> {
  const agendaId = agenda.id;
  const last = await deps.repo.findLastMessage(agendaId);
  if (!last || last.isAi) return null;
  if (now.getTime() - last.createdAt.getTime() <= STUDY_GROUP_STALEMATE_MINUTES * MS_PER_MINUTE) return null;

  const recent = await deps.repo.listRecentMessages(agendaId, STUDY_GROUP_CONTEXT_MESSAGES);
  const prompt =
    `O grupo está em silêncio há mais de ${STUDY_GROUP_STALEMATE_MINUTES} minutos. ` +
    `Faça uma pergunta socrática curta para destravar a discussão sobre: ${agenda.title}`;
  const { reply, fallback } = await deps.chatWithTutor(user, {
    agendaId,
    message: prompt,
    history: toHistory(recent),
    persistInteraction: false,
  });
  if (fallback) return null;
  // Outra mensagem pode ter chegado durante a geração: nesse caso a intervenção perdeu o sentido.
  const latest = await deps.repo.findLastMessage(agendaId);
  if (!latest || latest.id !== last.id) return null;
  const saved = await deps.repo.createMessage({ agendaId, authorId: null, content: reply, isAi: true });
  return toDTO(saved);
}
