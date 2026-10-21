import { z } from 'zod';
import { generateMinute } from '@/domains/pedagogy/services/minutes-service';
import { defineMcpTool } from '../mcp-tool';

/** `questionsCount`/`challengesCount` são aceitos por compatibilidade, mas ignorados: as métricas vêm das interações registradas. */
const schema = z.object({
  agendaId: z.string().min(1),
  studentId: z.string().min(1).optional(),
  questionsCount: z.number().int().min(0).optional(),
  challengesCount: z.number().int().min(0).optional(),
});

export const generateMinutesTool = defineMcpTool({
  name: 'generate_class_minutes',
  description:
    'Gera a Ata Pedagógica estruturada ao final da aula com métricas de engajamento, dúvidas sanadas e pontos de atenção, calculadas das interações registradas.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      agendaId: { type: 'string' },
      studentId: { type: 'string' },
    },
    required: ['agendaId'],
  },
  execute: (input, ctx) => generateMinute(ctx.user, { agendaId: input.agendaId, studentId: input.studentId }),
});
