export interface ClassMinuteData {
  id: string;
  agendaId: string;
  sessionTitle: string;
  studentId: string;
  studentName: string;
  engagementScore: number;  // 0-100%
  hesitationIndex: number;  // 0-100%
  topicsMastered: string[];
  topicsStruggled: string[];
  totalQuestionsAsked: number;
  socraticChallengesAnswered: number;
  /** Vazios quando a IA não estava disponível ao gerar a ata (ver `aiGenerated`). */
  rawSummary: string;
  actionableAdvice: string;
  /** false = métricas reais, mas o parecer textual não foi redigido pela IA. */
  aiGenerated: boolean;
  createdAt: string;
  /** Última geração/regeneração da ata; interações posteriores a ela tornam a ata desatualizada. */
  updatedAt: string;
  /** true = há interações do aluno mais novas que o parecer (a regeneração não aconteceu). Ausente equivale a false. */
  stale?: boolean;
}

export interface TeacherStruggleHeatmap {
  topic: string;
  strugglePercentage: number;
  affectedStudentsCount: number;
  suggestedAction: string;
}
