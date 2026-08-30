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
  rawSummary: string;
  actionableAdvice: string;
  createdAt: string;
}

export interface TeacherStruggleHeatmap {
  topic: string;
  strugglePercentage: number;
  affectedStudentsCount: number;
  suggestedAction: string;
}
