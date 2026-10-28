import { AgendaType, Role, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { DomainError } from '@/lib/api/domain-error';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';
import {
  getAgendaForUser,
  type AgendaActor,
  type AgendaDTO,
} from '@/domains/agendas/services/agenda-service';
import * as assessmentRepo from '@/domains/teaching/services/assessment-repository';
import type { SubmitExamInput } from '@/lib/validators/exam.validator';
import { questionSchema, type Question } from '../question-schema';
import * as submissionRepo from './submission-repository';

export const SUBMISSION_GRACE_SECONDS = 60;

const MS_PER_SECOND = 1000;
const SCORE_DECIMALS = 100;
const NOT_FOUND = 'Prova não encontrada.';
const STUDENT_ONLY = 'Apenas alunos podem enviar a prova.';
const ALREADY_SUBMITTED = 'Você já enviou esta prova.';
const SUBMISSION_CLOSED = 'O prazo para envio desta prova foi encerrado.';
const INVALID_OPTION = 'Alternativa inválida para a questão.';
const INVALID_QUESTIONS = 'A prova publicada possui questões inválidas.';

export type PublicQuestion = Omit<Question, 'correctKey' | 'rationale'>;

export type ExamSubmissionSummary = { score: number; maxScore: number; submittedAt: Date };

export type ExamDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  findAssessment(
    id: string
  ): Promise<{ id: string; questions: unknown; maxScore: number; durationMinutes: number } | null>;
  findSubmission(agendaId: string, studentId: string): Promise<ExamSubmissionSummary | null>;
  createSubmission(data: Prisma.ExamSubmissionUncheckedCreateInput): Promise<unknown>;
  now(): Date;
};

const defaultDeps: ExamDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  findAssessment: assessmentRepo.findAssessmentById,
  findSubmission: submissionRepo.findSubmission,
  createSubmission: submissionRepo.createSubmission,
  now: () => new Date(),
};

const round2 = (n: number) => Math.round(n * SCORE_DECIMALS) / SCORE_DECIMALS;

async function loadExam(user: AgendaActor, agendaId: string, deps: ExamDeps) {
  const agenda = await deps.getAgenda(agendaId, user);
  if (agenda.type !== AgendaType.EXAM || !agenda.assessmentId) throw new DomainError(404, NOT_FOUND);
  const assessment = await deps.findAssessment(agenda.assessmentId);
  if (!assessment) throw new DomainError(404, NOT_FOUND);
  const parsed = z.array(questionSchema).safeParse(assessment.questions);
  if (!parsed.success) throw new DomainError(500, INVALID_QUESTIONS);
  return { agenda, assessment, questions: parsed.data };
}

export async function getExamForStudent(user: AgendaActor, agendaId: string, deps: ExamDeps = defaultDeps) {
  const { agenda, assessment, questions } = await loadExam(user, agendaId, deps);
  const submission = await deps.findSubmission(agendaId, user.id);

  if (!submission) {
    const window = validateAgendaTimeWindow({ ...agenda, instructorName: agenda.teacherName }, deps.now());
    if (!window.isWithinWindow) throw new DomainError(422, window.message);
  }

  const publicQuestions: PublicQuestion[] = questions.map(({ id, enunciation, options, topic, chapterId }) => ({
    id,
    enunciation,
    options,
    topic,
    ...(chapterId ? { chapterId } : {}),
  }));

  return {
    agenda,
    questions: publicQuestions,
    serverNow: deps.now().toISOString(),
    durationMinutes: assessment.durationMinutes,
    maxScore: assessment.maxScore,
    alreadySubmitted: Boolean(submission),
    ...(submission
      ? {
          submission: {
            score: submission.score,
            maxScore: submission.maxScore,
            submittedAt: submission.submittedAt,
          },
        }
      : {}),
  };
}

export async function submitExam(
  user: AgendaActor,
  agendaId: string,
  input: SubmitExamInput,
  deps: ExamDeps = defaultDeps
) {
  if (user.role !== Role.STUDENT) throw new DomainError(403, STUDENT_ONLY);
  const { agenda, assessment, questions } = await loadExam(user, agendaId, deps);

  const deadline = new Date(agenda.endTime).getTime() + SUBMISSION_GRACE_SECONDS * MS_PER_SECOND;
  if (deps.now().getTime() > deadline) throw new DomainError(422, SUBMISSION_CLOSED);
  if (await deps.findSubmission(agendaId, user.id)) throw new DomainError(409, ALREADY_SUBMITTED);

  const byId = new Map(questions.map((q) => [q.id, q]));
  const lastAnswers = new Map<string, SubmitExamInput['answers'][number]>();
  for (const answer of input.answers) {
    const question = byId.get(answer.questionId);
    if (!question) continue;
    if (!question.options.some((o) => o.key === answer.chosenKey)) throw new DomainError(422, INVALID_OPTION);
    lastAnswers.set(answer.questionId, answer);
  }
  const valid = [...lastAnswers.values()];
  const correct = valid.filter((a) => byId.get(a.questionId)!.correctKey === a.chosenKey).length;
  const total = questions.length;
  const score = total === 0 ? 0 : round2((assessment.maxScore * correct) / total);

  try {
    await deps.createSubmission({
      agendaId,
      studentId: user.id,
      score,
      maxScore: assessment.maxScore,
      answers: valid.map((a) => ({ ...a, correctKey: byId.get(a.questionId)!.correctKey })),
      integrityLog: input.integrityLog,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new DomainError(409, ALREADY_SUBMITTED);
    throw error;
  }

  return { score, maxScore: assessment.maxScore, correct, total };
}
