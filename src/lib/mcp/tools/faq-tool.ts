export interface FAQItem {
  id: string;
  timestampSeconds: number;
  question: string;
  shortAnswer: string;
  sourceChapter: string;
}
import { LESSON_FAQS } from '@/lib/mocks-pending';

export const getLessonFaqsTool = {
  name: 'get_lesson_faqs',
  description: 'Retorna a lista de perguntas e respostas frequentes mapeadas para a aula ou timestamp do vídeo.',
  parameters: {
    type: 'object',
    properties: {
      lessonId: {
        type: 'string',
        description: 'Identificador da sessão ou aula.',
      },
    },
  },
  execute: async (args: { lessonId?: string }) => {
    const key = args.lessonId && LESSON_FAQS[args.lessonId] ? args.lessonId : 'default';
    return LESSON_FAQS[key];
  },
};
