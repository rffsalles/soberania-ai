import { AgendaType, type Prisma } from '@prisma/client';
import { assertOwner } from '@/domains/teaching/ownership';
import { z } from 'zod';
import { DomainError } from '@/lib/api/domain-error';
import type { AICompletionOptions, AIMessage, StreamChunk } from '@/lib/ai-provider';
import { collectStream } from '@/domains/agents/collect-stream';
import { createLoggedStreamChat } from '@/domains/telemetry/services/logged-stream-chat';
import { ASSESSMENT_PUBLISHED, ASSESSMENT_STATUS, LESSON_AI_RATE_LIMITED_MESSAGE, NO_INDEXED_CHAPTER_CONTENT } from '@/lib/constants/teaching';
import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import { sampleChunksByChapter } from '@/domains/rag/services/chunk-repository';
import { listDescendantIds } from '@/domains/rag/services/chapter-repository';
import { expandChapterScope, formatChapterLabel } from '@/domains/rag/services/chapter-scope';
import { resolveChapterSelection, type PlanChapterBook } from '@/domains/teaching/services/plan-chapters-service';
import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from '@/domains/rag/types';
import { createAgenda, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import {
  buildAssessmentMessages,
  parseAssessmentText,
} from '@/domains/agents/prompts/assessment-prompt';
import * as planRepo from '@/domains/teaching/services/teaching-plan-repository';
import * as assessmentRepo from '@/domains/teaching/services/assessment-repository';
import type {
  GenerateAssessmentInput,
  PublishAssessmentInput,
  UpdateAssessmentInput,
} from '@/lib/validators/assessment.validator';
import { OPTION_KEYS } from '@/lib/constants/assessments';
import { questionSchema, type Question, type Rubric } from '../question-schema';

export type AssessmentActor = AgendaActor;

type PlanForAssessment = {
  id: string;
  teacherId: string;
  subjectId: string;
  subject: { discipline: { name: string } };
};

type AssessmentWithPlan = {
  id: string;
  title: string;
  durationMinutes: number;
  status: string;
  teachingPlan: { id: string; teacherId: string; subjectId: string };
};

export type AssessmentDeps = {
  findPlan(id: string): Promise<PlanForAssessment | null>;
  findAssessment(id: string): Promise<AssessmentWithPlan | null>;
  updateAssessmentById(id: string, data: Prisma.AssessmentUncheckedUpdateInput): Promise<unknown>;
  claimAssessmentForPublish(id: string): Promise<boolean>;
  search(query: RAGSearchQuery): Promise<Pick<RAGSearchResult, 'chunks'>>;
  streamChat(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk>;
  createAgenda(user: AgendaActor, input: Parameters<typeof createAgenda>[1]): Promise<AgendaDTO>;
  listPlanChapters(planId: string): Promise<PlanChapterBook[]>;
  listDescendantIds(chapterIds: string[]): Promise<string[]>;
  sampleByChapter: typeof sampleChunksByChapter;
  replaceAssessmentChapters(assessmentId: string, chapterIds: string[]): Promise<void>;
};

const defaultDeps: AssessmentDeps = {
  findPlan: planRepo.findPlanForAssessment,
  findAssessment: assessmentRepo.findAssessmentWithPlan,
  updateAssessmentById: assessmentRepo.updateAssessmentById,
  claimAssessmentForPublish: assessmentRepo.claimAssessmentForPublish,
  search: executeHybridSearch,
  streamChat: createLoggedStreamChat(undefined, 'EXAM'),
  createAgenda: (user, input) => createAgenda(user, input),
  listPlanChapters: planRepo.listPlanChapters,
  listDescendantIds,
  sampleByChapter: sampleChunksByChapter,
  replaceAssessmentChapters: assessmentRepo.replaceAssessmentChapters,
};

/** Orçamento de tokens proporcional ao número de questões, com teto. */
export const assessmentMaxTokens = (n: number) => Math.min(MAX_ASSESSMENT_TOKENS, BASE_TOKENS + TOKENS_PER_QUESTION * n);

const ASSESSMENT_TEMPERATURE = 0.4;
const SEARCH_TOP_K = 4;
const SAMPLE_PER_CHAPTER = 4;
const SAMPLE_MAX = 12;
const BASE_TOKENS = 800;
const TOKENS_PER_QUESTION = 250;
const MAX_ASSESSMENT_TOKENS = 8000;
const MS_PER_MINUTE = 60_000;
const DISTRACTOR_COUNT = OPTION_KEYS.length - 1;
const SNIPPET_MAX_CHARS = 160;
const GENERIC_DISTRACTORS = [
  'O conteúdo apresentado não possui relação com a disciplina.',
  'Nenhum dos conceitos citados se aplica ao tema estudado.',
  'A afirmação contradiz integralmente o material didático.',
];
const DEFAULT_RUBRICS: Rubric[] = [
  { criterion: 'Acerto', description: 'Alternativa correta assinalada.', weight: 1 },
];

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const clip = (text: string) => (text.length > SNIPPET_MAX_CHARS ? `${text.slice(0, SNIPPET_MAX_CHARS)}...` : text);

/** Monta questões determinísticas a partir dos trechos recuperados (sem IA real). */
export function buildFallbackQuestions(chunks: DidacticChunk[], count: number): Question[] {
  return Array.from({ length: count }, (_, i) => {
    const chunk = chunks[i % chunks.length];
    const snippet = (c: DidacticChunk) => clip(sentences(c.content)[0] ?? c.content) || c.chapter || c.bookTitle;
    const correct = snippet(chunk);
    const pool = [...chunks.filter((c) => c.id !== chunk.id).map(snippet), ...GENERIC_DISTRACTORS];
    const distractors = [...new Set(pool)].filter((text) => text && text !== correct);
    for (let n = 1; distractors.length < DISTRACTOR_COUNT; n++) {
      const padding = `Nenhuma das afirmações anteriores se aplica (${n}).`;
      if (padding !== correct) distractors.push(padding);
    }
    const correctKey = OPTION_KEYS[i % OPTION_KEYS.length];
    let next = 0;
    const options = OPTION_KEYS.map((key) => ({ key, text: key === correctKey ? correct : distractors[next++] }));
    return {
      id: `q${i + 1}`,
      enunciation: `Com base no trecho: «${clip(chunk.content)}», qual afirmação está correta?`,
      options,
      correctKey,
      rationale: `A alternativa correta reproduz o conteúdo de ${chunk.bookTitle}, ${chunk.chapter}.`,
      topic: chunk.chapter,
    };
  });
}

async function askModel(messages: AIMessage[], maxTokens: number, deps: AssessmentDeps) {
  try {
    const { text, fallback, fallbackReason } = await collectStream(deps.streamChat, messages, {
      temperature: ASSESSMENT_TEMPERATURE,
      maxTokens,
    });
    if (fallbackReason === 'rate_limit') throw new DomainError(429, LESSON_AI_RATE_LIMITED_MESSAGE);
    return fallback ? null : parseAssessmentText(text);
  } catch (err) {
    if (err instanceof DomainError) throw err;
    console.warn('[assessments] falha ao gerar questões com a IA, usando fallback', err);
    return null;
  }
}

export async function generateQuestions(
  user: AssessmentActor,
  input: GenerateAssessmentInput,
  deps: AssessmentDeps = defaultDeps
): Promise<{ questions: Question[]; rubrics: Rubric[]; fallback: boolean }> {
  const plan = await deps.findPlan(input.teachingPlanId);
  if (!plan) throw new DomainError(404, 'Plano de ensino não encontrado.');
  assertOwner(user, plan.teacherId);

  const books = await deps.listPlanChapters(plan.id);
  const chosen = resolveChapterSelection(input.chapterIds, books);
  const info = new Map<string, { title: string; label: string }>();
  for (const book of books) {
    for (const c of book.chapters) info.set(c.id, { title: c.title, label: formatChapterLabel({ ...c, book }) });
  }

  const scopes = await Promise.all(chosen.map((id) => expandChapterScope([id], deps)));
  const results = await Promise.all(
    chosen.map((id, i) => deps.search({ query: info.get(id)!.title, allowedChapterIds: scopes[i], topK: SEARCH_TOP_K }))
  );
  const seen = new Set<string>();
  let chunks = results.flatMap((r) => r.chunks).filter((c) => !seen.has(c.id) && seen.add(c.id));
  if (chunks.length === 0) chunks = await deps.sampleByChapter([...new Set(scopes.flat())], SAMPLE_PER_CHAPTER, SAMPLE_MAX);
  if (chunks.length === 0) throw new DomainError(422, NO_INDEXED_CHAPTER_CONTENT);

  const messages = buildAssessmentMessages({
    subjectName: plan.subject.discipline.name,
    chapters: chosen.map((id) => ({ id, label: info.get(id)!.label })),
    chunks,
    questionCount: input.questionCount,
    type: input.type,
  });
  const ai = await askModel(messages, assessmentMaxTokens(input.questionCount), deps);
  const aiQuestions = ai && z.array(questionSchema).length(input.questionCount).safeParse(ai.questions).success;

  if (ai && aiQuestions) {
    const allowed = new Set(chosen);
    return {
      questions: ai.questions.map((q, i) => ({
        ...q,
        id: `q${i + 1}`,
        chapterId: q.chapterId && allowed.has(q.chapterId) ? q.chapterId : undefined,
      })),
      rubrics: ai.rubrics.length ? ai.rubrics : DEFAULT_RUBRICS,
      fallback: false,
    };
  }

  const questions = buildFallbackQuestions(chunks, input.questionCount);
  if (!z.array(questionSchema).length(input.questionCount).safeParse(questions).success) {
    throw new DomainError(500, 'Falha ao montar as questões de contingência.');
  }
  return { questions, rubrics: DEFAULT_RUBRICS, fallback: true };
}

export async function loadOwnedAssessment(id: string, user: AssessmentActor, deps: Pick<AssessmentDeps, 'findAssessment'>) {
  const assessment = await deps.findAssessment(id);
  if (!assessment) throw new DomainError(404, 'Avaliação não encontrada.');
  assertOwner(user, assessment.teachingPlan.teacherId);
  return assessment;
}

export async function updateAssessment(
  id: string,
  user: AssessmentActor,
  input: UpdateAssessmentInput,
  deps: AssessmentDeps = defaultDeps
) {
  const assessment = await loadOwnedAssessment(id, user, deps);
  if (assessment.status === ASSESSMENT_STATUS.PUBLISHED) throw new DomainError(409, ASSESSMENT_PUBLISHED);
  if (input.questions !== undefined) {
    const parsed = z.array(questionSchema).safeParse(input.questions);
    if (!parsed.success) throw new DomainError(400, 'Questões inválidas: cada questão exige 4 alternativas (A a D).');
  }

  // Explicit whitelist: the parent plan and status can never change through an update.
  const data: Prisma.AssessmentUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.type !== undefined) data.type = input.type;
  if (input.questions !== undefined) data.questions = input.questions;
  if (input.rubrics !== undefined) data.rubrics = input.rubrics;
  if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes;
  if (input.maxScore !== undefined) data.maxScore = input.maxScore;
  const chapterIds =
    input.chapterIds !== undefined
      ? resolveChapterSelection(input.chapterIds, await deps.listPlanChapters(assessment.teachingPlan.id))
      : undefined;
  const updated = await deps.updateAssessmentById(id, data);
  if (chapterIds !== undefined) await deps.replaceAssessmentChapters(id, chapterIds);
  return updated;
}

export async function publishAssessment(
  id: string,
  user: AssessmentActor,
  input: PublishAssessmentInput,
  deps: AssessmentDeps = defaultDeps
): Promise<AgendaDTO> {
  const assessment = await loadOwnedAssessment(id, user, deps);
  const start = new Date(input.startTime);
  const end = new Date(start.getTime() + assessment.durationMinutes * MS_PER_MINUTE);

  // Atomic DRAFT -> PUBLISHED claim: only one concurrent publish wins; revert on failure so a retry works.
  if (!(await deps.claimAssessmentForPublish(id))) throw new DomainError(409, 'Avaliação já publicada.');
  try {
    return await deps.createAgenda(user, {
      title: assessment.title,
      type: AgendaType.EXAM,
      classId: input.classId,
      subjectId: assessment.teachingPlan.subjectId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      assessmentId: id,
    });
  } catch (err) {
    try {
      await deps.updateAssessmentById(id, { status: ASSESSMENT_STATUS.DRAFT });
    } catch (revertErr) {
      console.error('[assessments] falha ao reverter o status após erro na agenda', revertErr);
    }
    throw err;
  }
}
