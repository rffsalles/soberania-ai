import { AgendaType, type Prisma } from '@prisma/client';
import { assertOwner } from '@/domains/teaching/ownership';
import { z } from 'zod';
import { DomainError } from '@/lib/api/domain-error';
import type { AICompletionOptions, AIMessage, StreamChunk } from '@/lib/ai-provider';
import { collectStream } from '@/domains/agents/collect-stream';
import { createLoggedStreamChat } from '@/domains/telemetry/services/logged-stream-chat';
import { ASSESSMENT_STATUS } from '@/lib/constants/teaching';
import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from '@/domains/rag/types';
import { createAgenda, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import {
  buildAssessmentMessages,
  parseAssessmentText,
  type AssessmentUnit,
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
  syllabus: string;
  unitsContent: unknown;
  subject: { discipline: { name: string } };
};

type AssessmentWithPlan = {
  id: string;
  title: string;
  durationMinutes: number;
  status: string;
  teachingPlan: { teacherId: string; subjectId: string };
};

export type AssessmentDeps = {
  findPlan(id: string): Promise<PlanForAssessment | null>;
  findAssessment(id: string): Promise<AssessmentWithPlan | null>;
  updateAssessmentById(id: string, data: Prisma.AssessmentUncheckedUpdateInput): Promise<unknown>;
  claimAssessmentForPublish(id: string): Promise<boolean>;
  search(query: RAGSearchQuery): Promise<Pick<RAGSearchResult, 'chunks'>>;
  streamChat(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk>;
  createAgenda(user: AgendaActor, input: Parameters<typeof createAgenda>[1]): Promise<AgendaDTO>;
};

const defaultDeps: AssessmentDeps = {
  findPlan: planRepo.findPlanForAssessment,
  findAssessment: assessmentRepo.findAssessmentWithPlan,
  updateAssessmentById: assessmentRepo.updateAssessmentById,
  claimAssessmentForPublish: assessmentRepo.claimAssessmentForPublish,
  search: executeHybridSearch,
  streamChat: createLoggedStreamChat(undefined, 'EXAM'),
  createAgenda: (user, input) => createAgenda(user, input),
};

const ASSESSMENT_TEMPERATURE = 0.4;
const ASSESSMENT_MAX_TOKENS = 4000;
const CHUNKS_PER_UNIT = 3;
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

function selectUnits(plan: PlanForAssessment, unitNumbers: number[]): AssessmentUnit[] {
  const parsed = z
    .array(z.object({ unitNumber: z.number(), title: z.string(), topics: z.array(z.string()).default([]) }))
    .safeParse(plan.unitsContent);
  const units = parsed.success ? parsed.data.filter((u) => unitNumbers.includes(u.unitNumber)) : [];
  if (units.length === 0) throw new DomainError(400, 'Nenhuma das unidades informadas existe no plano de ensino.');
  return units;
}

async function askModel(messages: AIMessage[], deps: AssessmentDeps) {
  try {
    const { text, fallback } = await collectStream(deps.streamChat, messages, {
      temperature: ASSESSMENT_TEMPERATURE,
      maxTokens: ASSESSMENT_MAX_TOKENS,
    });
    return fallback ? null : parseAssessmentText(text);
  } catch (err) {
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

  const units = selectUnits(plan, input.unitNumbers);
  const results = await Promise.all(
    units.map((u) =>
      deps.search({ query: `${u.title} ${u.topics.join(' ')}`, subjectName: plan.subject.discipline.name, topK: CHUNKS_PER_UNIT })
    )
  );
  const seen = new Set<string>();
  const chunks = results
    .flatMap((r) => r.chunks)
    .filter((c) => !seen.has(c.id) && seen.add(c.id));

  const messages = buildAssessmentMessages({
    syllabus: plan.syllabus,
    units,
    chunks,
    questionCount: input.questionCount,
    type: input.type,
  });
  const ai = await askModel(messages, deps);
  const aiQuestions = ai && z.array(questionSchema).length(input.questionCount).safeParse(ai.questions).success;

  if (ai && aiQuestions) {
    return {
      questions: ai.questions.map((q, i) => ({ ...q, id: `q${i + 1}` })),
      rubrics: ai.rubrics.length ? ai.rubrics : DEFAULT_RUBRICS,
      fallback: false,
    };
  }

  const base: DidacticChunk[] = chunks.length
    ? chunks
    : [
        {
          id: plan.id,
          materialId: plan.id,
          bookTitle: plan.subject.discipline.name,
          author: '',
          chapter: units[0].title,
          pageNumber: 0,
          content: plan.syllabus,
        },
      ];
  const questions = buildFallbackQuestions(base, input.questionCount);
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
  await loadOwnedAssessment(id, user, deps);
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
  return deps.updateAssessmentById(id, data);
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
