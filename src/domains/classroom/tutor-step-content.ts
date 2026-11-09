import type { TimeScriptItem } from '@/domains/teaching/time-script';
import type { RAGSearchQuery, RAGSearchResult, DidacticChunk } from '@/domains/rag/types';
import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import { findChapterLabels } from '@/domains/rag/services/chapter-repository';
import { loadTutorScope } from '@/domains/agents/services/chat-service';
import type { TutorScope } from '@/domains/agents/tutor-pipeline';
import { collectStream } from '@/domains/agents/collect-stream';
import {
  buildTutorCardMessages,
  chunkLabel,
  parseTutorCard,
  type CardSource,
} from '@/domains/agents/prompts/tutor-card-prompt';
import { buildLessonQuestionMessages } from '@/domains/agents/prompts/lesson-question-prompt';
import { generateQuestionsFromChunks } from '@/domains/assessments/services/assessment-service';
import {
  createLoggedStreamChat,
  type InferenceMeta,
  type StreamChatFn,
} from '@/domains/telemetry/services/logged-stream-chat';
import { parseClassEvent, type TutorCardPayload, type TutorQuestionPayload } from './class-event-schema';
import { failureReason, type CallResult } from './tutor-policy';
import { stepHash } from './tutor-step-hash';
import { isLexicallyRelevant, stepTopicTerms } from './lexical-relevance';
import {
  claimDraft,
  ensureDraft,
  releaseDraft,
  saveDraftContent,
  spendCall,
} from './tutor-step-draft-repository';

export const TUTOR_TOP_K = 3;
export const TUTOR_MIN_SIMILARITY = 0.55;
/** Busca só léxica (sem similaridade): fração mínima dos termos do tópico do passo que o trecho precisa conter. */
export const TUTOR_MIN_TERM_COVERAGE = 0.5;
export const TUTOR_CARD_TEMPERATURE = 0.3;
export const TUTOR_CARD_MAX_TOKENS = 900;

export type MultipleChoicePayload = Extract<TutorQuestionPayload, { kind: 'MULTIPLE_CHOICE' }>;

export type StepContentInput = {
  agendaId: string;
  lessonPlanId: string;
  stepIndex: number;
  item: TimeScriptItem;
  dailyObjective: string;
  chapterIds: string[];
  wantQuestion: boolean;
};

type Failure = { reason: 'RATE_LIMIT' | 'BUDGET' | 'PROVIDER_ERROR'; kind: 'CARD' | 'QUESTION' | 'BOTH' };

export type StepContent =
  | { status: 'BUSY' }
  | {
      status: 'DONE';
      noMaterial: boolean;
      card: { payload: TutorCardPayload; fromDraft: boolean } | null;
      question: { payload: MultipleChoicePayload; fromDraft: boolean } | null;
      failure: Failure | null;
    };

export type StepContentDeps = {
  drafts: {
    ensureDraft: typeof ensureDraft;
    claimDraft: typeof claimDraft;
    spendCall: typeof spendCall;
    saveDraftContent: typeof saveDraftContent;
    releaseDraft: typeof releaseDraft;
  };
  loadScope(lessonPlanId: string): Promise<TutorScope | undefined>;
  search(q: RAGSearchQuery): Promise<Pick<RAGSearchResult, 'chunks'>>;
  chapterLabels(chapterIds: string[]): Promise<Map<string, string>>;
  streamChat(meta: InferenceMeta): StreamChatFn;
};

const defaultDeps: StepContentDeps = {
  drafts: { ensureDraft, claimDraft, spendCall, saveDraftContent, releaseDraft },
  loadScope: (id) => loadTutorScope(id),
  search: (q) => executeHybridSearch(q),
  chapterLabels: findChapterLabels,
  streamChat: (meta) => createLoggedStreamChat(undefined, 'CLASSROOM', meta),
};

export function parseDraftCard(raw: unknown, stepIndex: number): TutorCardPayload | null {
  if (raw == null) return null;
  const parsed = parseClassEvent('TUTOR_CARD', raw, stepIndex);
  return parsed.ok ? ({ ...(parsed.payload as TutorCardPayload), source: 'DRAFT' } as TutorCardPayload) : null;
}

export function parseDraftQuestion(raw: unknown, stepIndex: number): MultipleChoicePayload | null {
  if (raw == null) return null;
  const parsed = parseClassEvent('TUTOR_QUESTION', raw, stepIndex);
  if (!parsed.ok) return null;
  const payload = parsed.payload as TutorQuestionPayload;
  return payload.kind === 'MULTIPLE_CHOICE' ? { ...payload, source: 'DRAFT' } : null;
}

/**
 * Com algum trecho trazendo similaridade vale o corte de similaridade, e trecho com casamento léxico
 * passa como antes. Sem similaridade em nenhum trecho, o casamento por OR não basta: o trecho precisa
 * cobrir os termos do tópico do passo, senão o passo fica sem material. Isso vale com embeddings
 * desligados e também com embeddings ligados mas degradados (EmbeddingUnavailableError cai para só
 * léxico) ou com materiais ainda sem embedding: efeito desejado, é o mesmo risco de trecho fora do tópico.
 *
 * Assimetria proposital: a busca usa a descrição do passo (mais palavras para recuperar), o filtro usa
 * o título da atividade (o assunto), caindo para a descrição e depois para a consulta da busca quando o
 * título só tem rótulos ("Revisão", "Intervalo"). Tópico ainda vazio: aviso no log e sem material.
 */
export function relevantChunks(
  found: DidacticChunk[],
  item: TimeScriptItem,
  searchQuery: string,
  stepIndex: number,
): DidacticChunk[] {
  if (found.length === 0) return [];
  const lexicalOnly = found.every((c) => c.similarityScore == null);
  if (!lexicalOnly) {
    return found.filter((c) => c.bm25Score != null || (c.similarityScore ?? 0) >= TUTOR_MIN_SIMILARITY);
  }
  const topic = stepTopicTerms(item.activity, item.description, searchQuery);
  if (topic.length === 0) {
    console.warn(`[TutorStepContent] passo ${stepIndex} sem termo significativo no tópico; tratado como sem material.`);
    return [];
  }
  return found.filter((c) =>
    isLexicallyRelevant(topic, [c.chapter, c.section, c.content].join(' '), TUTOR_MIN_TERM_COVERAGE),
  );
}

/** Uma linha por passo para calibrar TUTOR_MIN_SIMILARITY com embeddings reais (a suíte de evals não expõe a similaridade). */
function logStepRetrieval(stepIndex: number, found: DidacticChunk[], kept: number): void {
  const mode = found.some((c) => c.similarityScore != null) ? 'vector' : 'lexical';
  const sims = found.map((c) => c.similarityScore).filter((s): s is number => s != null);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  console.info(
    `[tutor-step] ${JSON.stringify({
      stepIndex,
      mode,
      bestSimilarity: sims.length > 0 ? round(Math.max(...sims)) : null,
      before: found.length,
      after: kept,
      cut: mode === 'vector' ? TUTOR_MIN_SIMILARITY : TUTOR_MIN_TERM_COVERAGE,
      chunks: found.map((c) => ({
        sim: c.similarityScore != null ? round(c.similarityScore) : null,
        lex: c.bm25Score != null,
        chapter: c.chapter.slice(0, 40),
      })),
    })}`,
  );
}

function missingKind(cardMissing: boolean, questionMissing: boolean): Failure['kind'] | null {
  if (cardMissing) return questionMissing ? 'BOTH' : 'CARD';
  return questionMissing ? 'QUESTION' : null;
}

export async function produceStepContent(
  input: StepContentInput,
  deps: StepContentDeps = defaultDeps,
): Promise<StepContent> {
  const { agendaId, lessonPlanId, stepIndex, item, dailyObjective, chapterIds, wantQuestion } = input;
  const { drafts } = deps;

  const hash = stepHash(item, chapterIds);
  const draft = await drafts.ensureDraft(lessonPlanId, stepIndex, hash);
  let card: { payload: TutorCardPayload; fromDraft: boolean } | null = null;
  const cardFromDraft = parseDraftCard(draft.card, stepIndex);
  if (cardFromDraft) card = { payload: cardFromDraft, fromDraft: true };
  let question: { payload: MultipleChoicePayload; fromDraft: boolean } | null = null;
  if (wantQuestion) {
    const q = parseDraftQuestion(draft.question, stepIndex);
    if (q) question = { payload: q, fromDraft: true };
  }

  const wantedMissing = () => missingKind(!card, wantQuestion && !question);
  const initialMissing = wantedMissing();
  if (!initialMissing) return { status: 'DONE', noMaterial: false, card, question, failure: null };
  // Reserva viva vem antes do teto: o worker dono ainda pode publicar o que gerou (BUDGET só depois que vence).
  if (draft.claimActive) return { status: 'BUSY' };
  if (draft.calls >= 2) {
    return { status: 'DONE', noMaterial: false, card, question, failure: { reason: 'BUDGET', kind: initialMissing } };
  }
  const claim = await drafts.claimDraft(draft.id);
  if (!claim) return { status: 'BUSY' };

  // Libera só nos caminhos normais. Numa exceção (busca, escopo, rótulos, gravação) a reserva fica
  // e o TTL de 60 s serve de backoff: no máximo uma tentativa por minuto por passo.
  const finish = async (content: StepContent): Promise<StepContent> => {
    await drafts.releaseDraft(draft.id, claim);
    return content;
  };
  // Reserva perdida (vencida e retomada, ou linha zerada por roteiro editado): para sem publicar nem liberar;
  // quem tem a linha agora (ou a checagem de passo parado) publica.
  const LOST: StepContent = { status: 'BUSY' };

  const scope = await deps.loadScope(lessonPlanId);
  const searchQuery = item.description.trim() || item.activity;
  const found = await deps.search({
    query: searchQuery,
    allowedChapterIds: scope?.allowedChapterIds,
    allowedMaterialIds: scope?.allowedMaterialIds,
    topK: TUTOR_TOP_K,
  });
  const chunks: DidacticChunk[] = relevantChunks(found.chunks, item, searchQuery, stepIndex);
  logStepRetrieval(stepIndex, found.chunks, chunks.length);
  if (chunks.length === 0) {
    // O que o rascunho já tinha continua valendo; noMaterial fala só do que falta.
    return finish({ status: 'DONE', noMaterial: true, card, question, failure: null });
  }

  const cardResults: CallResult[] = [];
  if (!card) {
    const labels = await deps.chapterLabels([
      ...new Set(chunks.map((c) => c.chapterId).filter((id): id is string => !!id)),
    ]);
    const sources: CardSource[] = chunks.map((c) => ({ ...c, label: chunkLabel(c, labels) }));
    const messages = buildTutorCardMessages({
      activity: item.activity,
      description: item.description,
      dailyObjective,
      sources,
    });
    while (!card) {
      const spent = await drafts.spendCall(draft.id, claim);
      if (spent === 'LOST') return LOST;
      if (spent === 'BUDGET') break;
      let result: CallResult;
      try {
        const { text, fallback, fallbackReason } = await collectStream(
          deps.streamChat({ agendaId, purpose: 'TUTOR_CARD' }),
          messages,
          { temperature: TUTOR_CARD_TEMPERATURE, maxTokens: TUTOR_CARD_MAX_TOKENS },
        );
        if (fallbackReason === 'rate_limit') result = 'rate_limit';
        else if (fallback) result = 'provider_error';
        else {
          const parsed = parseTutorCard(text, sources);
          if (parsed) {
            const payload: TutorCardPayload = { ...parsed, source: 'GENERATED' };
            if (!(await drafts.saveDraftContent(draft.id, claim, hash, { card: payload }))) return LOST;
            card = { payload, fromDraft: false };
            result = 'ok';
          } else result = 'invalid';
        }
      } catch {
        result = 'provider_error';
      }
      cardResults.push(result);
    }
  }

  const questionResults: CallResult[] = [];
  const questionSpend = wantQuestion && !question ? await drafts.spendCall(draft.id, claim) : null;
  if (questionSpend === 'LOST') return LOST;
  if (questionSpend === 'SPENT') {
    const generated = await generateQuestionsFromChunks(
      chunks,
      1,
      (c) =>
        buildLessonQuestionMessages({
          activity: item.activity,
          description: item.description,
          dailyObjective,
          chunks: c,
        }),
      { streamChat: deps.streamChat({ agendaId, purpose: 'TUTOR_QUESTION' }) },
    );
    if (generated.ok) {
      const payload: MultipleChoicePayload = {
        kind: 'MULTIPLE_CHOICE',
        question: { ...generated.questions[0], id: `step-${stepIndex}` },
        origin: 'TUTOR',
        source: 'GENERATED',
      };
      if (!(await drafts.saveDraftContent(draft.id, claim, hash, { question: payload }))) return LOST;
      question = { payload, fromDraft: false };
      questionResults.push('ok');
    } else questionResults.push(generated.reason);
  }

  const kind = wantedMissing();
  let failure: Failure | null = null;
  if (kind) {
    failure = {
      reason: failureReason(!card ? cardResults : questionResults),
      kind,
    };
  }
  return finish({ status: 'DONE', noMaterial: false, card, question, failure });
}
