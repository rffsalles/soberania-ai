import { DomainError } from '@/lib/api/domain-error';
import { getAgendaFaqs } from '@/domains/pedagogy/services/faq-service';
import type { McpContext } from '../mcp-context';

export const getLessonFaqsTool = {
  name: 'get_lesson_faqs',
  description: 'Retorna as perguntas e respostas mais frequentes dos alunos na sessão (agenda) informada.',
  parameters: {
    type: 'object',
    properties: {
      agendaId: {
        type: 'string',
        description: 'Identificador da agenda (sessão de aula).',
      },
    },
    required: ['agendaId'],
  },
  execute: async (args: { agendaId: string }, ctx?: McpContext) => {
    if (!ctx?.user) throw new DomainError(401, 'Contexto de usuário ausente para a ferramenta MCP.');
    return getAgendaFaqs(ctx.user, args.agendaId);
  },
};
