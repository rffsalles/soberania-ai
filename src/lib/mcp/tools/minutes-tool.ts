import { DomainError } from '@/lib/api/domain-error';
import { generateMinute } from '@/domains/pedagogy/services/minutes-service';
import type { McpContext } from '../mcp-context';

export const generateMinutesTool = {
  name: 'generate_class_minutes',
  description:
    'Gera a Ata Pedagógica estruturada ao final da aula com métricas de engajamento, dúvidas sanadas e pontos de atenção, calculadas das interações registradas.',
  parameters: {
    type: 'object',
    properties: {
      agendaId: { type: 'string' },
      studentId: { type: 'string' },
    },
    required: ['agendaId'],
  },
  execute: async (args: { agendaId: string; studentId?: string }, ctx?: McpContext) => {
    if (!ctx?.user) throw new DomainError(401, 'Contexto de usuário ausente para a ferramenta MCP.');
    return generateMinute(ctx.user, args);
  },
};
