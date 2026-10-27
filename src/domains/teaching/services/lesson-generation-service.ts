import { DomainError } from '@/lib/api/domain-error';
import { loggedStreamChat, type StreamChatFn } from '@/domains/telemetry/services/logged-stream-chat';
import { executeHybridSearch, formatCitation } from '@/domains/rag/hybrid-search';
import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from '@/domains/rag/types';
import {
  buildLessonGenerationMessages,
  buildLessonRefineMessages,
  parseLessonGeneration,
  stepsToTimeScript,
  type GeneratedLessonText,
} from '@/domains/agents/prompts/lesson-generation-prompt';
import type { RefineLessonInput } from '@/lib/validators/lesson.validator';
import { LESSON_AI_UNAVAILABLE_MESSAGE, LESSON_DEFAULT_DURATION_MINUTES, NO_LESSON_CHAPTERS } from '@/lib/constants/teaching';
import { assertOwner } from '../ownership';
import { timeScriptSchema, type TimeScriptItem } from '../time-script';
import { sampleChunksByChapter } from '@/domains/rag/services/chunk-repository';
import { listDescendantIds } from '@/domains/rag/services/chapter-repository';
import { findLessonForGeneration } from './lesson-plan-repository';
import type { PlanActor } from './teaching-plan-service';
import { collectStream } from '@/domains/agents/collect-stream';

export const NO_INDEXED_CHAPTER_CONTENT = 'Os capítulos selecionados não têm conteúdo indexado';
/** Soma das etapas aceita dentro de duração ± 10%. */
export const TIME_SCRIPT_TOLERANCE = 0.1;

export const SAMPLE_PER_CHAPTER = 4;
export const SAMPLE_MAX = 12;

export type LessonGenerationDeps = {
  findLesson: typeof findLessonForGeneration;
  search(q: RAGSearchQuery): Promise<Pick<RAGSearchResult, 'chunks'>>;
  sampleByChapter: typeof sampleChunksByChapter;
  listDescendantIds(chapterIds: string[]): Promise<string[]>;
  streamChat: StreamChatFn;
};
export type GeneratedLesson = Omit<GeneratedLessonText, 'steps'> & { timeScript: TimeScriptItem[]; citations: string[] };

const defaultDeps: LessonGenerationDeps = {
  findLesson: findLessonForGeneration,
  search: (q) => executeHybridSearch(q),
  sampleByChapter: sampleChunksByChapter,
  listDescendantIds,
  streamChat: loggedStreamChat,
};

const GENERATION_TEMPERATURE = 0.3;
const GENERATION_MAX_TOKENS = 2000;
const SEARCH_TOP_K = 4;

async function askModel(
  messages: ReturnType<typeof buildLessonGenerationMessages>,
  deps: LessonGenerationDeps
): Promise<GeneratedLessonText | null> {
  try {
    const { text, fallback } = await collectStream(deps.streamChat, messages, {
      temperature: GENERATION_TEMPERATURE,
      maxTokens: GENERATION_MAX_TOKENS,
    });
    return fallback ? null : parseLessonGeneration(text);
  } catch (err) {
    console.warn('[lesson-generation] falha ao gerar a aula com a IA', err);
    return null;
  }
}

/**
 * Gera objetivo, metodologia, recursos, exercício e roteiro da aula a partir dos trechos dos capítulos vinculados.
 * Não grava nada; o professor revisa e salva. Saída inválida, fora da tolerância de tempo ou fallback → 503.
 */
export async function generateLessonContent(
  lessonId: string,
  user: PlanActor,
  deps: LessonGenerationDeps = defaultDeps
): Promise<GeneratedLesson> {
  const lesson = await deps.findLesson(lessonId);
  if (!lesson) throw new DomainError(404, 'Plano de aula não encontrado.');
  const plan = lesson.courseSchedule.teachingPlan;
  assertOwner(user, plan.teacherId);
  if (lesson.chapters.length === 0) throw new DomainError(400, NO_LESSON_CHAPTERS);

  const allowedChapterIds = await deps.listDescendantIds(lesson.chapters.map((c) => c.chapter.id));
  const queries = [lesson.topicTitle, plan.generalObjectives, `exemplos e exercícios de ${lesson.topicTitle}`];
  const results = await Promise.all(
    queries.map((query) => deps.search({ query, allowedChapterIds, topK: SEARCH_TOP_K }))
  );
  const byId = new Map<string, DidacticChunk>();
  for (const r of results) for (const c of r.chunks) if (!byId.has(c.id)) byId.set(c.id, c);
  let chunks = Array.from(byId.values());
  if (chunks.length === 0) chunks = await deps.sampleByChapter(allowedChapterIds, SAMPLE_PER_CHAPTER, SAMPLE_MAX);
  if (chunks.length === 0) throw new DomainError(422, NO_INDEXED_CHAPTER_CONTENT);

  const duration = LESSON_DEFAULT_DURATION_MINUTES;
  const generated = await askModel(
    buildLessonGenerationMessages({
      subjectName: plan.subject.discipline.name,
      syllabus: plan.syllabus,
      classNumber: lesson.classNumber,
      totalClasses: lesson.courseSchedule.totalClasses,
      durationMinutes: duration,
      topicTitle: lesson.topicTitle,
      chapters: lesson.chapters,
      chunks,
    }),
    deps
  );
  if (!generated) throw new DomainError(503, LESSON_AI_UNAVAILABLE_MESSAGE);

  const total = generated.steps.reduce((sum, s) => sum + s.durationMinutes, 0);
  if (total < duration * (1 - TIME_SCRIPT_TOLERANCE) || total > duration * (1 + TIME_SCRIPT_TOLERANCE)) {
    throw new DomainError(503, LESSON_AI_UNAVAILABLE_MESSAGE);
  }
  const timeScript = timeScriptSchema.safeParse(stepsToTimeScript(generated.steps));
  if (!timeScript.success) throw new DomainError(503, LESSON_AI_UNAVAILABLE_MESSAGE);

  const { steps: _steps, ...text } = generated;
  return { ...text, timeScript: timeScript.data, citations: Array.from(new Set(chunks.map(formatCitation))) };
}

export const REFINE_TEMPERATURE = 0.4;
const REFINE_MAX_TOKENS = 600;
const REFINE_TOP_K = 2;

async function askRefine(
  messages: ReturnType<typeof buildLessonRefineMessages>,
  deps: LessonGenerationDeps
): Promise<string | null> {
  try {
    const { text, fallback } = await collectStream(deps.streamChat, messages, {
      temperature: REFINE_TEMPERATURE,
      maxTokens: REFINE_MAX_TOKENS,
    });
    return fallback ? null : text.trim() || null;
  } catch (err) {
    console.warn('[lesson-generation] falha ao refinar o campo com a IA', err);
    return null;
  }
}

/** Refina um campo da aula conforme a instrução do professor, com 2 trechos dos capítulos. Não grava nada. */
export async function refineLessonField(
  lessonId: string,
  user: PlanActor,
  input: RefineLessonInput,
  deps: LessonGenerationDeps = defaultDeps
): Promise<{ text: string }> {
  const lesson = await deps.findLesson(lessonId);
  if (!lesson) throw new DomainError(404, 'Plano de aula não encontrado.');
  const plan = lesson.courseSchedule.teachingPlan;
  assertOwner(user, plan.teacherId);
  if (lesson.chapters.length === 0) throw new DomainError(400, NO_LESSON_CHAPTERS);

  const allowedChapterIds = await deps.listDescendantIds(lesson.chapters.map((c) => c.chapter.id));
  const found = await deps.search({
    query: `${input.instruction} ${lesson.topicTitle}`,
    allowedChapterIds,
    topK: REFINE_TOP_K,
  });
  const chunks =
    found.chunks.length > 0 ? found.chunks : await deps.sampleByChapter(allowedChapterIds, SAMPLE_PER_CHAPTER, SAMPLE_MAX);
  if (chunks.length === 0) throw new DomainError(422, NO_INDEXED_CHAPTER_CONTENT);

  const text = await askRefine(
    buildLessonRefineMessages({
      subjectName: plan.subject.discipline.name,
      topicTitle: lesson.topicTitle,
      chapters: lesson.chapters,
      field: input.field,
      stepIndex: input.stepIndex,
      instruction: input.instruction,
      current: input.current,
      chunks,
    }),
    deps
  );
  if (!text) throw new DomainError(503, LESSON_AI_UNAVAILABLE_MESSAGE);
  return { text };
}
