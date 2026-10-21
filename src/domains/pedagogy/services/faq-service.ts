import { getAgendaForUser, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { buildFaqs, FAQ_DEFAULT_LIMIT, FAQ_MAX_LIMIT, type FAQItem, type FaqInteraction } from '../faq-builder';
import { listInteractionsByAgenda } from './interaction-repository';

export type FaqDeps = {
  getAgenda: (id: string, user: AgendaActor) => Promise<AgendaDTO>;
  listInteractions: (agendaId: string) => Promise<FaqInteraction[]>;
};

const defaultDeps: FaqDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  listInteractions: listInteractionsByAgenda,
};

/** FAQ dinâmica da aula: perguntas mais frequentes dos alunos na agenda (escopo validado pela agenda). */
export async function getAgendaFaqs(
  user: AgendaActor,
  agendaId: string,
  limit: number = FAQ_DEFAULT_LIMIT,
  deps: FaqDeps = defaultDeps
): Promise<FAQItem[]> {
  await deps.getAgenda(agendaId, user);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), FAQ_MAX_LIMIT) : FAQ_DEFAULT_LIMIT;
  return buildFaqs(await deps.listInteractions(agendaId), safeLimit);
}
