import { describe, it, expect } from 'vitest';
import { generateClassMinute } from '../minutes-generator';
import { getTeacherStruggleHeatmap } from '../struggle-analyzer';

describe('Pedagogy Domain - Minutes and Struggle Heatmap', () => {
  it('deve gerar Ata Pedagógica com engajamento e recomendações formativas', () => {
    const minute = generateClassMinute({
      agendaId: 'session-live-01',
      sessionTitle: 'Modelagem Conceitual',
      studentId: 'student-lucas',
      studentName: 'Lucas Ferreira',
      questionsCount: 4,
      challengesCount: 2,
    });

    expect(minute.id).toBeDefined();
    expect(minute.engagementScore).toBeGreaterThanOrEqual(70);
    expect(minute.topicsMastered.length).toBeGreaterThan(0);
    expect(minute.actionableAdvice).toBeDefined();
  });

  it('deve calcular heatmap de dificuldades docentes com percentual de turma', () => {
    const heatmap = getTeacherStruggleHeatmap();
    expect(heatmap.length).toBeGreaterThan(0);
    expect(heatmap[0].strugglePercentage).toBeGreaterThan(0);
    expect(heatmap[0].suggestedAction).toBeDefined();
  });
});
