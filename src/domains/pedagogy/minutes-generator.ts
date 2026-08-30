import type { ClassMinuteData } from './types';

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
