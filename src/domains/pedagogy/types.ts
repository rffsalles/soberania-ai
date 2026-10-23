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
}

export interface TeacherStruggleHeatmap {
  topic: string;
  strugglePercentage: number;
  affectedStudentsCount: number;
  suggestedAction: string;
}
