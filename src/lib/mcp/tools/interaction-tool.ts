import { z } from 'zod';
import { AgendaType, InteractionType, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { createInteraction } from '@/domains/pedagogy/services/interaction-repository';
import { defineMcpTool } from '../mcp-tool';

const FOREIGN_STUDENT_MESSAGE = 'Estudantes só podem registrar as próprias interações.';

const schema = z.object({
  agendaId: z.string().min(1),
  studentId: z.string().min(1),
  questionText: z.string().min(1),
  responseText: z.string().min(1),
  timestampSeconds: z.number().int().min(0).optional(),
  isSocraticChallenge: z.boolean().optional(),
  agendaType: z.nativeEnum(AgendaType),
});

export const registerInteractionTool = defineMcpTool({
  name: 'register_student_interaction',
  description:
    'Registra uma interação socrática ou dúvida do estudante em tempo real no histórico da sessão pedagógica.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      agendaId: { type: 'string' },
      studentId: { type: 'string' },
      questionText: { type: 'string' },
      responseText: { type: 'string' },
      timestampSeconds: { type: 'number' },
      isSocraticChallenge: { type: 'boolean' },
      agendaType: { type: 'string', enum: Object.values(AgendaType) },
    },
    required: ['agendaId', 'studentId', 'questionText', 'responseText', 'agendaType'],
  },
  execute: async (input, ctx) => {
    const isPrivileged = ctx.user.role === Role.TEACHER || ctx.user.role === Role.ADMIN;
    if (!isPrivileged && input.studentId !== ctx.user.id) {
      throw new DomainError(403, FOREIGN_STUDENT_MESSAGE);
    }
    const isSocraticChallenge = input.isSocraticChallenge ?? false;
    const record = await createInteraction({
      agendaId: input.agendaId,
      studentId: input.studentId,
      type: isSocraticChallenge ? InteractionType.SOCRATIC_CHALLENGE : InteractionType.QUESTION,
      agendaType: input.agendaType,
      questionText: input.questionText,
      responseText: input.responseText,
      timestampInVideo: input.timestampSeconds ?? null,
      isSocraticChallenge,
    });
    return { success: true, recordId: record.id };
  },
});
