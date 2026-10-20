import { InteractionType } from '@prisma/client';

export type MetricInteraction = {
  type: InteractionType;
  guardrailBlocked: boolean;
  wasCorrect: boolean | null;
  latencyMs: number | null;
  ragSourceBook: string | null;
  ragSourcePage: number | null;
};

const SCORE_MIN = 0;
const SCORE_MAX = 100;
const ENGAGEMENT_BASE = 40;
const ENGAGEMENT_PER_QUESTION = 6;
const ENGAGEMENT_PER_CHALLENGE = 10;
const ENGAGEMENT_PER_BLOCK = 15;
const GAP_CAP_SECONDS = 120;
const GAP_WEIGHT = 60;
const WRONG_WEIGHT = 40;

function clamp(value: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));
}

export function computeEngagement(input: {
  questions: number;
  challengesAnswered: number;
  guardrailBlocks: number;
}): number {
  return clamp(
    ENGAGEMENT_BASE +
      ENGAGEMENT_PER_QUESTION * input.questions +
      ENGAGEMENT_PER_CHALLENGE * input.challengesAnswered -
      ENGAGEMENT_PER_BLOCK * input.guardrailBlocks
  );
}

export function computeHesitation(input: { avgResponseGapSeconds: number; wrongRate: number }): number {
  const gap = Math.min(input.avgResponseGapSeconds, GAP_CAP_SECONDS);
  return clamp(Math.round((gap / GAP_CAP_SECONDS) * GAP_WEIGHT + input.wrongRate * WRONG_WEIGHT));
}

function topicKey(i: MetricInteraction): string | null {
  if (!i.ragSourceBook) return null;
  return i.ragSourcePage == null ? i.ragSourceBook : `${i.ragSourceBook}, pág. ${i.ragSourcePage}`;
}

export function splitTopics(interactions: MetricInteraction[]): { mastered: string[]; struggled: string[] } {
  const struggledSet = new Set<string>();
  const seen = new Set<string>();
  for (const i of interactions) {
    const key = topicKey(i);
    if (!key) continue;
    seen.add(key);
    if (i.wasCorrect === false || i.guardrailBlocked) struggledSet.add(key);
  }
  const all = [...seen];
  return {
    mastered: all.filter((t) => !struggledSet.has(t)),
    struggled: all.filter((t) => struggledSet.has(t)),
  };
}

export type MinuteMetrics = {
  engagementScore: number;
  hesitationIndex: number;
  totalQuestionsAsked: number;
  socraticChallengesAnswered: number;
  guardrailBlocks: number;
  topicsMastered: string[];
  topicsStruggled: string[];
};

export function computeMetrics(interactions: MetricInteraction[]): MinuteMetrics {
  const questions = interactions.filter((i) => i.type === InteractionType.QUESTION && !i.guardrailBlocked).length;
  const challengesAnswered = interactions.filter((i) => i.type === InteractionType.SOCRATIC_CHALLENGE).length;
  const guardrailBlocks = interactions.filter((i) => i.guardrailBlocked).length;

  const latencies = interactions.filter((i) => i.latencyMs != null).map((i) => (i.latencyMs as number) / 1000);
  const avgResponseGapSeconds = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  const graded = interactions.filter((i) => i.wasCorrect != null);
  const wrong = graded.filter((i) => i.wasCorrect === false).length;
  const wrongRate = graded.length ? wrong / graded.length : 0;

  const { mastered, struggled } = splitTopics(interactions);
  return {
    engagementScore: computeEngagement({ questions, challengesAnswered, guardrailBlocks }),
    hesitationIndex: computeHesitation({ avgResponseGapSeconds, wrongRate }),
    totalQuestionsAsked: questions,
    socraticChallengesAnswered: challengesAnswered,
    guardrailBlocks,
    topicsMastered: mastered,
    topicsStruggled: struggled,
  };
}
