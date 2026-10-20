import { describe, it, expect } from 'vitest';
import { buildHeatmap, HEATMAP_ACTIONS } from '../reports-service';
import type { MinuteDTO } from '../minutes-service';

function minute(studentId: string, struggled: string[]): MinuteDTO {
  return {
    id: `m-${studentId}`,
    agendaId: 'ag-1',
    sessionTitle: 'Aula',
    studentId,
    studentName: studentId,
    engagementScore: 80,
    hesitationIndex: 10,
    topicsMastered: [],
    topicsStruggled: struggled,
    totalQuestionsAsked: 1,
    socraticChallengesAnswered: 1,
    rawSummary: '',
    actionableAdvice: '',
    createdAt: '2026-10-20T10:00:00.000Z',
    subjectName: 'BD',
    className: 'ADS-3A',
  };
}

describe('buildHeatmap', () => {
  it('calcula percentual por aluno e sugere revisão em aula a partir de 50%', () => {
    const heatmap = buildHeatmap([
      minute('s1', ['LEFT JOIN']),
      minute('s2', ['LEFT JOIN', '3FN']),
      minute('s3', []),
      minute('s4', []),
    ]);
    expect(heatmap[0]).toEqual({
      topic: 'LEFT JOIN',
      strugglePercentage: 50,
      affectedStudentsCount: 2,
      suggestedAction: HEATMAP_ACTIONS.REVIEW,
    });
    expect(heatmap[0].suggestedAction).toBe('Revisar em aula');
  });

  it('ordena de forma decrescente e aplica as faixas de ação', () => {
    const heatmap = buildHeatmap([
      minute('s1', ['A', 'B']),
      minute('s2', ['A']),
      minute('s3', ['A']),
      ...['s4', 's5', 's6', 's7', 's8', 's9', 's10'].map((id) => minute(id, [])),
    ]);
    expect(heatmap.map((h) => h.topic)).toEqual(['A', 'B']);
    expect(heatmap[0].strugglePercentage).toBe(30);
    expect(heatmap[0].suggestedAction).toBe('Exercícios no grupo de estudos');
    expect(heatmap[1].strugglePercentage).toBe(10);
    expect(heatmap[1].suggestedAction).toBe('Manter cronograma');
  });

  it('conta cada aluno uma vez mesmo com várias atas', () => {
    const heatmap = buildHeatmap([minute('s1', ['A']), minute('s1', ['A']), minute('s2', [])]);
    expect(heatmap[0].affectedStudentsCount).toBe(1);
    expect(heatmap[0].strugglePercentage).toBe(50);
  });

  it('retorna vazio sem atas', () => {
    expect(buildHeatmap([])).toEqual([]);
  });
});
