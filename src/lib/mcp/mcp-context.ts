import type { AgendaActor } from '@/domains/agendas/services/agenda-service';

/** Contexto passado a cada ferramenta MCP: o usuário autenticado que a invocou. */
export type McpContext = { user: AgendaActor };
