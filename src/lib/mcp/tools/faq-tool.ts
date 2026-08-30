export interface FAQItem {
  id: string;
  timestampSeconds: number;
  question: string;
  shortAnswer: string;
  sourceChapter: string;
}

const LESSON_FAQS: Record<string, FAQItem[]> = {
  default: [
    {
      id: 'faq-01',
      timestampSeconds: 180,
      question: 'Por que usamos INNER JOIN em vez de WHERE tabelaA.id = tabelaB.id?',
      shortAnswer: 'O INNER JOIN segue a sintaxe padrão ANSI SQL-92, tornando o código mais legível e evitando acidentes de produto cartesiano (CROSS JOIN) esquecidos.',
      sourceChapter: 'Cap. 4, pág. 58',
    },
    {
      id: 'faq-02',
      timestampSeconds: 420,
      question: 'O que acontece se uma tupla da tabela esquerda não tiver par no LEFT JOIN?',
      shortAnswer: 'A linha da tabela esquerda permanece no resultado final, e todos os campos da tabela direita são preenchidos com NULL.',
      sourceChapter: 'Cap. 4, pág. 62',
    },
    {
      id: 'faq-03',
      timestampSeconds: 780,
      question: 'Como a 3ª Forma Normal previne anomalias de exclusão?',
      shortAnswer: 'Ao isolar atributos dependentes em tabelas próprias com chaves estrangeiras, excluir um registro filho não deleta acidentalmente os dados mestres da entidade.',
      sourceChapter: 'Cap. 6, pág. 112',
    },
  ],
};

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
