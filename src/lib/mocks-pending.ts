import type { FAQItem } from '@/lib/mcp/tools/faq-tool';
import type { SocraticCheckpoint } from '@/components/classroom/interactive-video-player';

export interface PublicExamQuestion {
  id: number;
  enunciation: string;
  options: { key: string; text: string }[];
  selectedOption?: string;
}

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

// REMOVER: Task 19
export const EXAM_QUESTIONS: PublicExamQuestion[] = [
  {
    id: 1,
    enunciation:
      'Considere duas relações: Estudantes(id, nome) e Matriculas(id, estudante_id, disciplina). Qual consulta SQL retorna todos os estudantes, independentemente de estarem ou não matriculados em alguma disciplina?',
    options: [
      { key: 'A', text: 'SELECT * FROM Estudantes INNER JOIN Matriculas ON Estudantes.id = Matriculas.estudante_id;' },
      { key: 'B', text: 'SELECT * FROM Estudantes LEFT OUTER JOIN Matriculas ON Estudantes.id = Matriculas.estudante_id;' },
      { key: 'C', text: 'SELECT * FROM Estudantes RIGHT JOIN Matriculas ON Estudantes.id = Matriculas.estudante_id;' },
      { key: 'D', text: 'SELECT * FROM Estudantes CROSS JOIN Matriculas;' },
    ],
  },
  {
    id: 2,
    enunciation:
      'Uma relação está na 3ª Forma Normal (3FN) quando:',
    options: [
      { key: 'A', text: 'Não possui atributos multivalorados e está na 1FN.' },
      { key: 'B', text: 'Está na 2FN e nenhum atributo não-chave depende transitivamente de uma chave primária.' },
      { key: 'C', text: 'Possui chave primária composta e todas as colunas são dependentes parciais.' },
      { key: 'D', text: 'Todas as tuplas são duplicadas para garantir redundância e alta disponibilidade.' },
    ],
  },
  {
    id: 3,
    enunciation:
      'Qual propriedade ACID assegura que, em caso de falha de energia durante uma transação financeira, nenhuma alteração parcial permaneça no banco de dados?',
    options: [
      { key: 'A', text: 'Atomicidade' },
      { key: 'B', text: 'Consistência' },
      { key: 'C', text: 'Isolamento' },
      { key: 'D', text: 'Durabilidade' },
    ],
  },
];

// REMOVER: Task 22
export const SCHEDULE_MEETINGS = [
  {
    num: 1,
    date: '10/Fev - Seg',
    type: 'Teórica',
    title: 'Apresentação da Ementa e Arquitetura ANSI/SPARC de SGBD',
    ragStatus: '✓ RAG Indexado',
  },
  {
    num: 2,
    date: '12/Fev - Qua',
    type: 'Prática Lab',
    title: 'Mapeamento Entidade-Relacionamento no PostgreSQL Local',
    ragStatus: '✓ RAG Indexado',
  },
  {
    num: 3,
    date: '17/Fev - Seg',
    type: 'Feriado',
    title: 'Recesso de Carnaval (Compensação Automática Calculada pela IA)',
    ragStatus: 'N/A',
  },
  {
    num: 4,
    date: '19/Fev - Qua',
    type: 'Prática Lab',
    title: 'Joins Avançados, Subqueries e Operações de Conjunto',
    ragStatus: '✓ RAG Indexado',
  },
  {
    num: 16,
    date: '15/Abr - Ter',
    type: 'Avaliação P1',
    title: 'Prova Bimestral P1 Supervisionada com Anti-Fraude',
    ragStatus: '✓ Matriz Homologada',
  },
];

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
