import type { FAQItem } from '@/lib/mcp/tools/faq-tool';
import type { SocraticCheckpoint } from '@/components/classroom/interactive-video-player';

// Dados de demonstração ainda lidos por telas não migradas. Cada export é removido na task indicada.

// REMOVER: Task 24
export const LESSON_FAQS: Record<string, FAQItem[]> = {
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

// REMOVER: Task 24
export const DEFAULT_CHECKPOINTS: SocraticCheckpoint[] = [
  {
    timeSeconds: 45,
    label: 'Pausa Socrática 01',
    prompt:
      'A Tutora Lucy pausou o vídeo sob coordenação docente: "Se uma tabela Alunos não tiver correspondência na tabela Notas, o que o INNER JOIN fará com esse aluno?"',
  },
  {
    timeSeconds: 120,
    label: 'Pausa Socrática 02',
    prompt:
      'Reflexão em grupo: "Qual a diferença prática de performance entre um LEFT JOIN indexado e um produto cartesiano?"',
  },
];
