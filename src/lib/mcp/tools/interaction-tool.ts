import { AgendaType, InteractionType } from '@prisma/client';
import { createInteraction } from '@/domains/pedagogy/services/interaction-repository';

export interface InteractionToolArgs {
  agendaId: string;
  studentId: string;
  questionText: string;
  responseText: string;
  timestampSeconds?: number;
  isSocraticChallenge?: boolean;
  agendaType?: AgendaType;
}

export const registerInteractionTool = {
  name: 'register_student_interaction',
  description:
    'Registra uma interação socrática ou dúvida do estudante em tempo real no histórico da sessão pedagógica.',
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
    required: ['agendaId', 'studentId', 'questionText', 'responseText'],
  },
  execute: async (args: InteractionToolArgs) => {
    const isSocraticChallenge = args.isSocraticChallenge ?? false;
    const record = await createInteraction({
      agendaId: args.agendaId,
      studentId: args.studentId,
      type: isSocraticChallenge ? InteractionType.SOCRATIC_CHALLENGE : InteractionType.QUESTION,
      agendaType: args.agendaType ?? AgendaType.CLASSROOM,
      questionText: args.questionText,
      responseText: args.responseText,
      timestampInVideo: args.timestampSeconds === undefined ? null : Math.round(args.timestampSeconds),
      isSocraticChallenge,
    });
    return { success: true, recordId: record.id };
  },
};
