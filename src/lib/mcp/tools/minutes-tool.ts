import { generateClassMinute } from '@/domains/pedagogy/minutes-generator';

export const generateMinutesTool = {
  name: 'generate_class_minutes',
  description:
    'Gera a Ata Pedagógica estruturada ao final da aula com métricas de engajamento, dúvidas sanadas e pontos de atenção.',
  parameters: {
    type: 'object',
    properties: {
      agendaId: { type: 'string' },
      sessionTitle: { type: 'string' },
      studentId: { type: 'string' },
      studentName: { type: 'string' },
      questionsCount: { type: 'number' },
      challengesCount: { type: 'number' },
    },
    required: ['agendaId', 'sessionTitle', 'studentId', 'studentName'],
  },
  execute: async (args: {
    agendaId: string;
    sessionTitle: string;
    studentId: string;
    studentName: string;
    questionsCount?: number;
    challengesCount?: number;
  }) => {
    return generateClassMinute(args);
  },
};
