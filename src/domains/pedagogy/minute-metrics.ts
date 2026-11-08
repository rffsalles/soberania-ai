import { InteractionType } from '@prisma/client';

/** Uma interação persistida = uma mensagem do aluno + a resposta da tutora (mesmo aluno, mesma agenda). */
export type MetricInteraction = {
  type: InteractionType;
  guardrailBlocked: boolean;
  /** A resposta da tutora nesta interação terminou em desafio socrático. */
  isSocraticChallenge: boolean;
  wasCorrect: boolean | null;
  /** Tempo de geração da resposta da tutora (do recebimento da mensagem até a gravação). */
  latencyMs: number | null;
  /** Gravado ao fim da resposta da tutora. */
  createdAt: Date;
  ragSourceBook: string | null;
  ragSourcePage: number | null;
  /** Preenchido só na resposta do aluno a uma pergunta publicada na aula (evento da tutora); null no chat. */
  classEventSeq: number | null;
};

const isEventAnswer = (i: MetricInteraction) => i.classEventSeq != null;

const SCORE_MIN = 0;
const SCORE_MAX = 100;
/** Sem interação o engajamento é 0: nenhum ponto de partida inventado. */
const ENGAGEMENT_BASE = 0;
const ENGAGEMENT_PER_QUESTION = 6;
const ENGAGEMENT_PER_CHALLENGE = 10;
const ENGAGEMENT_PER_BLOCK = 15;
const GAP_CAP_SECONDS = 120;
/** Teto por intervalo: pausas longas (intervalo, troca de atividade) não viram hesitação. */
const REFLECTION_CAP_SECONDS = 600;
const MS_PER_SECOND = 1000;
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

/**
 * Índice de hesitação (0..100) = min(reflexão média, 120 s) / 120 s × 60 + taxa de wasCorrect=false × 40.
 * A reflexão vem de `reflectionGapsSeconds`.
 */
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

/**
 * Tempo de reflexão do aluno em cada turno do chat após o primeiro: do fim da resposta anterior (`createdAt` anterior)
 * até a chegada da mensagem atual (`createdAt` atual menos a latência da tutora nesta resposta),
 * limitado a 0..10 min por intervalo. Espera interações ordenadas por `createdAt`.
 * Respostas a perguntas da aula (`classEventSeq`) não têm latência nem turno de chat e ficam de fora.
 */
export function reflectionGapsSeconds(ordered: MetricInteraction[]): number[] {
  const chat = ordered.filter((i) => !isEventAnswer(i));
  const gaps: number[] = [];
  for (let i = 1; i < chat.length; i += 1) {
    const sentAt = chat[i].createdAt.getTime() - (chat[i].latencyMs ?? 0);
    const seconds = (sentAt - chat[i - 1].createdAt.getTime()) / MS_PER_SECOND;
    gaps.push(Math.min(REFLECTION_CAP_SECONDS, Math.max(0, seconds)));
  }
  return gaps;
}

/**
 * Desafios respondidos: cada resposta a uma pergunta da aula (`classEventSeq`) conta uma vez; no chat, conta a
 * mensagem cuja interação de chat anterior (por `createdAt`) terminou em desafio socrático. A resposta a uma
 * pergunta da aula nunca é tratada como desafio lançado para a mensagem seguinte.
 */
export function countAnsweredChallenges(ordered: MetricInteraction[]): number {
  let answered = 0;
  let previousChat: MetricInteraction | null = null;
  for (const i of ordered) {
    if (isEventAnswer(i)) {
      answered += 1;
      continue;
    }
    if (previousChat?.isSocraticChallenge) answered += 1;
    previousChat = i;
  }
  return answered;
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

/** Métricas de um aluno em uma agenda; `interactions` são só as dele, nessa agenda. */
export function computeMetrics(interactions: MetricInteraction[]): MinuteMetrics {
  const ordered = [...interactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const questions = ordered.filter((i) => i.type === InteractionType.QUESTION && !i.guardrailBlocked).length;
  const challengesAnswered = countAnsweredChallenges(ordered);
  const guardrailBlocks = ordered.filter((i) => i.guardrailBlocked).length;

  const gaps = reflectionGapsSeconds(ordered);
  const avgResponseGapSeconds = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

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
