export interface InteractionRecord {
  id: string;
  agendaId: string;
  studentId: string;
  questionText: string;
  responseText: string;
  timestampSeconds?: number;
  isSocraticChallenge: boolean;
  recordedAt: string;
}

const IN_MEMORY_INTERACTIONS: InteractionRecord[] = [];

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
    },
    required: ['agendaId', 'studentId', 'questionText', 'responseText'],
  },
  execute: async (args: Omit<InteractionRecord, 'id' | 'recordedAt'>) => {
    const record: InteractionRecord = {
      id: `inter-${Date.now()}`,
      ...args,
      recordedAt: new Date().toISOString(),
    };
    IN_MEMORY_INTERACTIONS.push(record);
    return { success: true, recordId: record.id };
  },
};
