import type { ClassMinuteData, TeacherStruggleHeatmap } from '@/domains/pedagogy/types';
import type { FAQItem } from '@/lib/mcp/tools/faq-tool';
import type { SocraticCheckpoint } from '@/components/classroom/interactive-video-player';

export interface PublicExamQuestion {
  id: number;
  enunciation: string;
  options: { key: string; text: string }[];
  selectedOption?: string;
}

// Dados de demonstração ainda lidos por telas não migradas. Cada export é removido na task indicada.

// REMOVER: Task 17
export function getMockMinutesFeed(): ClassMinuteData[] {
  return [
    {
      id: 'min-01',
      agendaId: 'session-live-01',
      sessionTitle: 'Modelagem Conceitual e Álgebra Relacional (JOINs)',
      studentId: 'usr-student-01',
      studentName: 'Lucas Ferreira',
      engagementScore: 92.5,
      hesitationIndex: 18.0,
      topicsMastered: ['INNER JOIN', 'Filtragem WHERE'],
      topicsStruggled: ['LEFT JOIN NULL handling'],
      totalQuestionsAsked: 4,
      socraticChallengesAnswered: 3,
      rawSummary: 'Excelente desempenho nas pausas socráticas sobre junção interna e relatórios analíticos.',
      actionableAdvice: 'Praticar consultas com tabelas auto-relacionadas (Self JOIN).',
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 'min-02',
      agendaId: 'session-live-01',
      sessionTitle: 'Modelagem Conceitual e Álgebra Relacional (JOINs)',
      studentId: 'usr-student-02',
      studentName: 'Beatriz Ramos',
      engagementScore: 88.0,
      hesitationIndex: 25.4,
      topicsMastered: ['Projeção e Seleção'],
      topicsStruggled: ['Dependência Transitiva (3FN)'],
      totalQuestionsAsked: 2,
      socraticChallengesAnswered: 2,
      rawSummary: 'Compreendeu a semântica de chaves primárias e relacionamentos 1:N.',
      actionableAdvice: 'Revisar o capítulo 6 do livro de Banco de Dados (pág. 112).',
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    {
      id: 'min-03',
      agendaId: 'session-live-01',
      sessionTitle: 'Modelagem Conceitual e Álgebra Relacional (JOINs)',
      studentId: 'usr-student-03',
      studentName: 'Gabriel Souza',
      engagementScore: 95.0,
      hesitationIndex: 12.0,
      topicsMastered: ['CROSS JOIN', 'LEFT JOIN', 'FULL JOIN'],
      topicsStruggled: [],
      totalQuestionsAsked: 5,
      socraticChallengesAnswered: 3,
      rawSummary: 'Desempenho exemplar com 100% de acerto nos desafios socráticos intermediários.',
      actionableAdvice: 'Pronto para os desafios avançados de otimização de queries com EXPLAIN ANALYZE.',
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  ];
}

// REMOVER: Task 17
export function getTeacherStruggleHeatmap(): TeacherStruggleHeatmap[] {
  return [
    {
      topic: 'LEFT OUTER JOIN com tratamento de nulos (NULL)',
      strugglePercentage: 54.2,
      affectedStudentsCount: 19,
      suggestedAction:
        'A Tutora Lucy sugere ao Professor Responsável dedicar os primeiros 15 minutos da próxima aula a um diagrama visual comparando INNER vs LEFT JOIN com exemplos práticos.',
    },
    {
      topic: 'Identificação de Dependência Transitiva (3FN)',
      strugglePercentage: 42.8,
      affectedStudentsCount: 15,
      suggestedAction:
        'Disponibilizar 3 exercícios guiados no Grupo de Estudos sobre decomposição de tabelas não-normalizadas.',
    },
    {
      topic: 'Diferença entre Agrupamento (GROUP BY) e Filtro (HAVING)',
      strugglePercentage: 28.5,
      affectedStudentsCount: 10,
      suggestedAction:
        'Recomendar a leitura da pág. 78 da apostila oficial e propor desafio relâmpago no Plantão de Dúvidas.',
    },
    {
      topic: 'Cálculo de Custo de Execução (Index Scan vs Seq Scan)',
      strugglePercentage: 16.0,
      affectedStudentsCount: 6,
      suggestedAction:
        'Tópico dominado pela maioria da turma. Manter o cronograma planejado.',
    },
  ];
}

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

// REMOVER: Task 17
export function generateClassMinute(params: {
  agendaId: string;
  sessionTitle: string;
  studentId: string;
  studentName: string;
  questionsCount?: number;
  challengesCount?: number;
}): ClassMinuteData {
  const qCount = params.questionsCount ?? 3;
  const cCount = params.challengesCount ?? 2;

  // Cálculo heurístico de engajamento pedagógico
  const engagement = Math.min(100, Math.round(70 + qCount * 6 + cCount * 8));
  const hesitation = Math.max(10, Math.round(35 - qCount * 3));

  return {
    id: `minute-${Date.now()}`,
    agendaId: params.agendaId,
    sessionTitle: params.sessionTitle,
    studentId: params.studentId,
    studentName: params.studentName,
    engagementScore: engagement,
    hesitationIndex: hesitation,
    topicsMastered: ['Álgebra Relacional Básica', 'Sintaxe INNER JOIN', 'Projeção (SELECT)'],
    topicsStruggled: ['LEFT OUTER JOIN com valores NULL', 'Diferenciação entre 2FN e 3FN'],
    totalQuestionsAsked: qCount,
    socraticChallengesAnswered: cCount,
    rawSummary: `O estudante participou ativamente da aula síncrona, respondendo prontamente a 2 pausas reflexivas do vídeo. Demonstrou domínio seguro de operações de junção simples, com ligeira hesitação ao lidar com tuplas que contêm atributos nulos no OUTER JOIN.`,
    actionableAdvice: `Revisar os exercícios das páginas 62 a 65 da apostila de Banco de Dados antes da avaliação diagnóstica de sexta-feira.`,
    createdAt: new Date().toISOString(),
  };
}
