import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';
import { DRAFT_FALLBACK_SCORE, DRAFT_MAX_SCORE } from '@/lib/constants/assessments';
import { DRAFT_MENTOR_SYSTEM_PROMPT } from './socratic-prompts';

export type DraftRubricItem = { criterion: string; description: string; weight: number };
export type DraftRubricScore = { criterion: string; score: number; comment: string };
export type DraftFeedback = { feedback: string; rubricScores: DraftRubricScore[] };

const FORMAT_INSTRUCTION = `
Responda APENAS com um objeto JSON no formato:
{"feedback":"orientação formativa em texto corrido","rubricScores":[{"criterion":"...","score":0,"comment":"..."}]}
Cada "score" vai de 0 a ${DRAFT_MAX_SCORE}. Inclua exatamente um item por critério da rubrica. NÃO reescreva o texto do estudante.
`;

const CITATION_PATTERN = /\([A-ZÀ-Ú][^()]*,\s*\d{4}\)/g;
const PARAGRAPH_SEPARATOR = /\n\s*\n/;
const MIN_PARAGRAPHS = 3;

export function buildDraftFeedbackMessages(content: string, rubric: DraftRubricItem[]): AIMessage[] {
  const criteria = rubric.map((r) => `- ${r.criterion}: ${r.description} (peso ${r.weight})`).join('\n');
  return [
    { role: 'system', content: `${DRAFT_MENTOR_SYSTEM_PROMPT.trim()}\n${FORMAT_INSTRUCTION.trim()}` },
    { role: 'user', content: `Rubrica:\n${criteria}\n\nRascunho do estudante:\n${content}` },
  ];
}

const feedbackSchema = z.object({
  feedback: z.string().trim().min(1),
  rubricScores: z
    .array(
      z.object({
        criterion: z.string().min(1),
        score: z.coerce.number(),
        comment: z.string().default(''),
      })
    )
    .min(1),
});

/** Extrai o primeiro objeto JSON do texto; null quando ausente ou inválido. */
export function parseDraftFeedback(raw: string): DraftFeedback | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = feedbackSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const SCORE_DECIMALS = 10;
const MISSING_COMMENT = 'Critério não avaliado pela IA; nota indicativa padrão.';
const normalize = (s: string) => s.trim().toLowerCase();

/** Monta as notas a partir da rubrica: limita 0..10, preenche faltantes e descarta critérios inventados. */
export function reconcileRubricScores(rubric: DraftRubricItem[], scores: DraftRubricScore[]): DraftRubricScore[] {
  const byCriterion = new Map<string, DraftRubricScore>();
  for (const s of scores) if (!byCriterion.has(normalize(s.criterion))) byCriterion.set(normalize(s.criterion), s);
  return rubric.map((r) => {
    const found = byCriterion.get(normalize(r.criterion));
    if (!found || !Number.isFinite(found.score)) {
      return { criterion: r.criterion, score: DRAFT_FALLBACK_SCORE, comment: MISSING_COMMENT };
    }
    const clamped = Math.min(DRAFT_MAX_SCORE, Math.max(0, found.score));
    return {
      criterion: r.criterion,
      score: Math.round(clamped * SCORE_DECIMALS) / SCORE_DECIMALS,
      comment: found.comment,
    };
  });
}

/** Feedback determinístico por heurísticas simples, usado sem IA real. */
export function buildFallbackDraftFeedback(content: string, rubric: DraftRubricItem[]): DraftFeedback {
  const words = content.split(/\s+/).filter(Boolean).length;
  const paragraphs = content.split(PARAGRAPH_SEPARATOR).filter((p) => p.trim()).length;
  const citations = content.match(CITATION_PATTERN)?.length ?? 0;
  const notes = [
    `O texto tem ${words} palavra(s) distribuída(s) em ${paragraphs} parágrafo(s).`,
    paragraphs < MIN_PARAGRAPHS
      ? 'Considere organizar as ideias em mais parágrafos, com introdução, desenvolvimento e conclusão.'
      : 'A divisão em parágrafos favorece a progressão das ideias.',
    citations === 0
      ? 'Não foram identificadas citações no formato (AUTOR, ANO); fundamente os argumentos em fontes.'
      : `Foram identificadas ${citations} citação(ões), o que reforça a fundamentação.`,
    'A nota final é atribuída exclusivamente pelo Professor Responsável.',
  ];
  return {
    feedback: notes.join(' '),
    rubricScores: rubric.map((r) => ({
      criterion: r.criterion,
      score: DRAFT_FALLBACK_SCORE,
      comment: `Avaliação indicativa de ${r.criterion.toLowerCase()}: revise o texto à luz da rubrica.`,
    })),
  };
}
