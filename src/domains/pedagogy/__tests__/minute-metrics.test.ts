import { describe, it, expect } from 'vitest';
import { InteractionType } from '@prisma/client';
import {
  computeEngagement,
  computeHesitation,
  computeMetrics,
  splitTopics,
  type MetricInteraction,
} from '../minute-metrics';

const T0 = Date.parse('2026-10-20T19:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000);

function make(o: Partial<MetricInteraction>): MetricInteraction {
  return {
    type: InteractionType.QUESTION,
    guardrailBlocked: false,
    isSocraticChallenge: false,
    wasCorrect: null,
    latencyMs: null,
    createdAt: at(0),
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

  it('socraticChallengesAnswered conta só as interações logo após um desafio persistido', () => {
    const metrics = computeMetrics([
      make({ createdAt: at(0), isSocraticChallenge: true, type: InteractionType.SOCRATIC_CHALLENGE }),
      make({ createdAt: at(30), isSocraticChallenge: true, type: InteractionType.SOCRATIC_CHALLENGE, wasCorrect: true }),
      make({ createdAt: at(60), wasCorrect: false }),
      make({ createdAt: at(90) }),
      // Desafio final sem resposta: não conta.
      make({ createdAt: at(120), isSocraticChallenge: true, type: InteractionType.SOCRATIC_CHALLENGE }),
    ]);
    expect(metrics.socraticChallengesAnswered).toBe(2);
  });

  it('respostas da tutora terminadas em desafio não inflam o engajamento sem resposta do aluno', () => {
    const challenges = Array.from({ length: 6 }, (_, i) =>
      make({ createdAt: at(i * 3600), isSocraticChallenge: i % 2 === 0, type: InteractionType.QUESTION })
    );
    // Só as interações 1, 3 e 5 seguem um desafio.
    expect(computeMetrics(challenges).socraticChallengesAnswered).toBe(3);
  });

  it('ordena por createdAt antes de procurar o desafio anterior', () => {
    const metrics = computeMetrics([
      make({ createdAt: at(30) }),
      make({ createdAt: at(0), isSocraticChallenge: true }),
    ]);
    expect(metrics.socraticChallengesAnswered).toBe(1);
  });

  it('hesitationIndex usa o tempo de reflexão entre turnos, não a latência da tutora', () => {
    // Intervalos de 60 s entre turnos (descontada a latência de 2 s da resposta atual): 58 s.
    const reflective = computeMetrics([
      make({ createdAt: at(0), latencyMs: 2000 }),
      make({ createdAt: at(60), latencyMs: 2000 }),
      make({ createdAt: at(120), latencyMs: 2000 }),
    ]);
    expect(reflective.hesitationIndex).toBe(computeHesitation({ avgResponseGapSeconds: 58, wrongRate: 0 }));

    // Latência alta da tutora não conta como hesitação do aluno.
    const slowTutor = computeMetrics([
      make({ createdAt: at(0), latencyMs: 90_000 }),
      make({ createdAt: at(100), latencyMs: 90_000 }),
    ]);
    expect(slowTutor.hesitationIndex).toBe(computeHesitation({ avgResponseGapSeconds: 10, wrongRate: 0 }));
  });

  it('limita cada intervalo a 10 minutos e combina com a taxa de wasCorrect=false', () => {
    const metrics = computeMetrics([
      make({ createdAt: at(0) }),
      make({ createdAt: at(3 * 3600), wasCorrect: false }),
      make({ createdAt: at(3 * 3600 + 20), wasCorrect: true }),
    ]);
    // (600 + 20) / 2 = 310 s de média; taxa de erro 0,5.
    expect(metrics.hesitationIndex).toBe(computeHesitation({ avgResponseGapSeconds: 310, wrongRate: 0.5 }));
  });

  it('sem intervalos (uma única interação) a hesitação vem só da taxa de erro', () => {
    expect(computeMetrics([make({ wasCorrect: false, latencyMs: 120_000 })]).hesitationIndex).toBe(40);
  });
});
