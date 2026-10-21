import { z } from 'zod';
import { getAgendaFaqs } from '@/domains/pedagogy/services/faq-service';
import { defineMcpTool } from '../mcp-tool';

const MAX_LIMIT = 20;

const schema = z.object({
  agendaId: z.string().min(1),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

export const getLessonFaqsTool = defineMcpTool({
  name: 'get_lesson_faqs',
  description: 'Retorna as perguntas e respostas mais frequentes dos alunos na sessão (agenda) informada.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      agendaId: { type: 'string', description: 'Identificador da agenda (sessão de aula).' },
      limit: { type: 'number', description: `Máximo de itens (1 a ${MAX_LIMIT}).` },
    },
    required: ['agendaId'],
  },
  execute: (input, ctx) => getAgendaFaqs(ctx.user, input.agendaId, input.limit),
});
