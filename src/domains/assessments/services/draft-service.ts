import { AgendaType, Role } from '@prisma/client';
import { z } from 'zod';
import { DomainError } from '@/lib/api/domain-error';
import { aiProvider, type AICompletionOptions, type AIMessage, type StreamChunk } from '@/lib/ai-provider';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';
import {
  getAgendaForUser,
  type AgendaActor,
  type AgendaDTO,
} from '@/domains/agendas/services/agenda-service';
import {
  buildDraftFeedbackMessages,
  buildFallbackDraftFeedback,
  parseDraftFeedback,
  type DraftFeedback,
  type DraftRubricItem,
} from '@/domains/agents/prompts/draft-feedback-prompt';
import { parseDocumentFile } from '@/domains/rag/file-parser';
import * as assessmentRepo from '@/domains/teaching/services/assessment-repository';
import { DEFAULT_DRAFT_RUBRIC, DRAFT_MIN_CHARS } from '@/lib/constants/assessments';
import { rubricSchema } from '../question-schema';
import * as draftRepo from './draft-repository';

const NOT_FOUND = 'Orientação de trabalho não encontrada.';
const STUDENT_ONLY = 'Apenas alunos podem enviar rascunhos.';
const TOO_SHORT = `O texto deve ter pelo menos ${DRAFT_MIN_CHARS} caracteres.`;
const EMPTY_FILE = 'Não foi possível extrair texto do arquivo enviado.';
const FEEDBACK_TEMPERATURE = 0.3;
const FEEDBACK_MAX_TOKENS = 2000;

export type DraftFile = { buffer: Buffer; name: string };
export type DraftInput = { agendaId: string; content?: string; file?: DraftFile };

export type DraftResult = DraftFeedback & { id: string; createdAt: Date };

export type DraftDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  findRubrics(assessmentId: string): Promise<{ rubrics: unknown } | null>;
  createDraft(data: {
    agendaId: string;
    studentId: string;
    content: string;
    feedback: string;
    rubricScores: DraftFeedback['rubricScores'];
  }): Promise<{ id: string; createdAt: Date }>;
  listDrafts(agendaId: string, studentId: string): Promise<unknown[]>;
  streamChat(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk>;
  parseFile(buffer: Buffer, filename: string): Promise<string>;
  now(): Date;
};

const defaultDeps: DraftDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  findRubrics: assessmentRepo.findAssessmentRubrics,
  createDraft: draftRepo.createDraft,
  listDrafts: draftRepo.listDraftsByStudent,
  streamChat: (messages, options) => aiProvider.streamChat(messages, options),
  parseFile: async (buffer, filename) => {
    const parsed = await parseDocumentFile(buffer, filename);
    return parsed.pages.map((p) => p.text).join('\n\n');
  },
  now: () => new Date(),
};

async function loadDraftAgenda(user: AgendaActor, agendaId: string, deps: DraftDeps) {
  const agenda = await deps.getAgenda(agendaId, user);
  if (agenda.type !== AgendaType.DRAFT_REVIEW) throw new DomainError(404, NOT_FOUND);
  return agenda;
}

async function resolveRubric(agenda: AgendaDTO, deps: DraftDeps): Promise<DraftRubricItem[]> {
  if (!agenda.assessmentId) return DEFAULT_DRAFT_RUBRIC;
  const stored = await deps.findRubrics(agenda.assessmentId);
  const parsed = z.array(rubricSchema).safeParse(stored?.rubrics);
  return parsed.success && parsed.data.length > 0 ? parsed.data : DEFAULT_DRAFT_RUBRIC;
}

async function askModel(content: string, rubric: DraftRubricItem[], deps: DraftDeps) {
  try {
    let text = '';
    let fallback = false;
    for await (const chunk of deps.streamChat(buildDraftFeedbackMessages(content, rubric), {
      temperature: FEEDBACK_TEMPERATURE,
      maxTokens: FEEDBACK_MAX_TOKENS,
    })) {
      text += chunk.token;
      if (chunk.fallback) fallback = true;
    }
    return fallback ? null : parseDraftFeedback(text);
  } catch (err) {
    console.warn('[drafts] falha ao gerar feedback com a IA, usando fallback', err);
    return null;
  }
}

export async function submitDraft(
  user: AgendaActor,
  input: DraftInput,
  deps: DraftDeps = defaultDeps
): Promise<DraftResult> {
  if (user.role !== Role.STUDENT) throw new DomainError(403, STUDENT_ONLY);
  const agenda = await loadDraftAgenda(user, input.agendaId, deps);
  const window = validateAgendaTimeWindow({ ...agenda, instructorName: agenda.teacherName }, deps.now());
  if (!window.isWithinWindow) throw new DomainError(422, window.message);

  const raw = input.file ? await deps.parseFile(input.file.buffer, input.file.name) : (input.content ?? '');
  const content = raw.trim();
  if (input.file && !content) throw new DomainError(400, EMPTY_FILE);
  if (content.length < DRAFT_MIN_CHARS) throw new DomainError(400, TOO_SHORT);

  const rubric = await resolveRubric(agenda, deps);
  const evaluation = (await askModel(content, rubric, deps)) ?? buildFallbackDraftFeedback(content, rubric);

  const saved = await deps.createDraft({
    agendaId: agenda.id,
    studentId: user.id,
    content,
    feedback: evaluation.feedback,
    rubricScores: evaluation.rubricScores,
  });
  return { id: saved.id, createdAt: saved.createdAt, ...evaluation };
}

/** Rascunhos enviados pelo próprio aluno nesta agenda (mais recentes primeiro). */
export async function listMyDrafts(user: AgendaActor, agendaId: string, deps: DraftDeps = defaultDeps) {
  await loadDraftAgenda(user, agendaId, deps);
  return deps.listDrafts(agendaId, user.id);
}
