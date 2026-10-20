import { describe, it, expect } from 'vitest';
import { InteractionType } from '@prisma/client';
import { computeEngagement, computeHesitation, splitTopics, type MetricInteraction } from '../minute-metrics';

function make(o: Partial<MetricInteraction>): MetricInteraction {
  return {
    type: InteractionType.QUESTION,
    guardrailBlocked: false,
    wasCorrect: null,
    latencyMs: null,
    ragSourceBook: null,
    ragSourcePage: null,
    ...o,
  };
}

describe('minute-metrics', () => {
  it('computeEngagement aplica a fórmula e limita a 0..100', () => {
    expect(computeEngagement({ questions: 3, challengesAnswered: 2, guardrailBlocks: 0 })).toBe(78);
    expect(computeEngagement({ questions: 0, challengesAnswered: 0, guardrailBlocks: 2 })).toBe(10);
    expect(computeEngagement({ questions: 0, challengesAnswered: 0, guardrailBlocks: 10 })).toBe(0);
    expect(computeEngagement({ questions: 50, challengesAnswered: 0, guardrailBlocks: 0 })).toBe(100);
  });

  it('computeHesitation combina intervalo médio e taxa de erro', () => {
    expect(computeHesitation({ avgResponseGapSeconds: 120, wrongRate: 0.5 })).toBe(80);
    expect(computeHesitation({ avgResponseGapSeconds: 600, wrongRate: 1 })).toBe(100);
    expect(computeHesitation({ avgResponseGapSeconds: 0, wrongRate: 0 })).toBe(0);
  });

  it('splitTopics separa dominados e com dificuldade, ignorando interações sem fonte', () => {
    const { mastered, struggled } = splitTopics([
      make({ ragSourceBook: 'BD', ragSourcePage: 10, wasCorrect: true }),
      make({ ragSourceBook: 'BD', ragSourcePage: 20, wasCorrect: false }),
      make({ ragSourceBook: 'BD', ragSourcePage: 30, guardrailBlocked: true }),
      make({ ragSourceBook: 'BD', ragSourcePage: 40 }),
      make({ wasCorrect: false }),
    ]);
    expect(mastered).toEqual(['BD, pág. 10', 'BD, pág. 40']);
    expect(struggled).toEqual(['BD, pág. 20', 'BD, pág. 30']);
  });
});
