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
import {
  claimDraft,
  ensureDraft,
  releaseDraft,
  saveDraftContent,
  spendCall,
} from './tutor-step-draft-repository';

export const TUTOR_TOP_K = 3;
export const TUTOR_MIN_SIMILARITY = 0.55;
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

function draftCard(raw: unknown, stepIndex: number): TutorCardPayload | null {
  if (raw == null) return null;
  const parsed = parseClassEvent('TUTOR_CARD', raw, stepIndex);
  return parsed.ok ? ({ ...(parsed.payload as TutorCardPayload), source: 'DRAFT' } as TutorCardPayload) : null;
}

function draftQuestion(raw: unknown, stepIndex: number): MultipleChoicePayload | null {
  if (raw == null) return null;
  const parsed = parseClassEvent('TUTOR_QUESTION', raw, stepIndex);
  if (!parsed.ok) return null;
  const payload = parsed.payload as TutorQuestionPayload;
  return payload.kind === 'MULTIPLE_CHOICE' ? { ...payload, source: 'DRAFT' } : null;
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

  const draft = await drafts.ensureDraft(lessonPlanId, stepIndex, stepHash(item, chapterIds));
  let card: { payload: TutorCardPayload; fromDraft: boolean } | null = null;
  const cardFromDraft = draftCard(draft.card, stepIndex);
  if (cardFromDraft) card = { payload: cardFromDraft, fromDraft: true };
  let question: { payload: MultipleChoicePayload; fromDraft: boolean } | null = null;
  if (wantQuestion) {
    const q = draftQuestion(draft.question, stepIndex);
    if (q) question = { payload: q, fromDraft: true };
  }

  const wantedMissing = () => missingKind(!card, wantQuestion && !question);
  const initialMissing = wantedMissing();
  if (!initialMissing) return { status: 'DONE', noMaterial: false, card, question, failure: null };
  if (draft.calls >= 2) {
    return { status: 'DONE', noMaterial: false, card, question, failure: { reason: 'BUDGET', kind: initialMissing } };
  }
  if (!(await drafts.claimDraft(draft.id))) return { status: 'BUSY' };

  try {
    const scope = await deps.loadScope(lessonPlanId);
    const found = await deps.search({
      query: item.description.trim() || item.activity,
      allowedChapterIds: scope?.allowedChapterIds,
      allowedMaterialIds: scope?.allowedMaterialIds,
      topK: TUTOR_TOP_K,
    });
    const chunks: DidacticChunk[] = found.chunks.filter(
      (c) => c.bm25Score != null || (c.similarityScore ?? 0) >= TUTOR_MIN_SIMILARITY,
    );
    if (chunks.length === 0) {
      return { status: 'DONE', noMaterial: true, card: null, question: null, failure: null };
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
      while (!card && (await drafts.spendCall(draft.id))) {
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
              await drafts.saveDraftContent(draft.id, { card: payload });
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
    if (wantQuestion && !question && (await drafts.spendCall(draft.id))) {
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
        await drafts.saveDraftContent(draft.id, { question: payload });
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
    return { status: 'DONE', noMaterial: false, card, question, failure };
  } finally {
    await drafts.releaseDraft(draft.id);
  }
}
