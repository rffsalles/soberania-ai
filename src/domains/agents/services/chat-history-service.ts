import { Role } from '@prisma/client';
import { getAgendaForUser, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { listRecentInteractions, type ChatHistoryRecord } from '@/domains/pedagogy/services/interaction-repository';
import { CHAT_HISTORY_PAGE } from '@/lib/constants/chat';

export type ChatHistoryItem = {
  id: string;
  question: string;
  answer: string;
  citation: string | null;
  guardrailBlocked: boolean;
  createdAt: string;
};

export type ChatHistoryDeps = {
  getAgenda: (id: string, user: AgendaActor) => Promise<AgendaDTO>;
  listRecent: (agendaId: string, studentId: string, limit: number) => Promise<ChatHistoryRecord[]>;
};

const defaultDeps: ChatHistoryDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  listRecent: listRecentInteractions,
};

function buildCitation(book: string | null, page: number | null): string | null {
  if (!book) return null;
  return page != null ? `[${book} · pág. ${page}]` : `[${book}]`;
}

/** Histórico do chat do próprio aluno na agenda (cronológico, últimos CHAT_HISTORY_PAGE). */
export async function listStudentChatHistory(
  user: AgendaActor,
  agendaId: string,
  deps: ChatHistoryDeps = defaultDeps
): Promise<ChatHistoryItem[]> {
  await deps.getAgenda(agendaId, user); // 404 fora do escopo
  if (user.role !== Role.STUDENT) return [];
  const recent = await deps.listRecent(agendaId, user.id, CHAT_HISTORY_PAGE);
  return recent
    .slice()
    .reverse()
    .map((r) => ({
      id: r.id,
      question: r.questionText,
      answer: r.responseText,
      citation: buildCitation(r.ragSourceBook, r.ragSourcePage),
      guardrailBlocked: r.guardrailBlocked,
      createdAt: r.createdAt.toISOString(),
    }));
}
