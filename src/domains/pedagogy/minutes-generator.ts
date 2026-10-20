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
