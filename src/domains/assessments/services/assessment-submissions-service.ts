import { loadOwnedAssessment, type AssessmentActor, type AssessmentDeps } from './assessment-service';
import * as submissionRepo from './submission-repository';
import * as assessmentRepo from '@/domains/teaching/services/assessment-repository';
import * as userRepo from '@/domains/auth/services/user-repository';
import { listInteractionsByAgenda } from '@/domains/pedagogy/services/interaction-repository';

type SubmissionRow = {
  agendaId: string;
  studentId: string;
  score: number;
  maxScore: number;
  submittedAt: Date;
  integrityLog: unknown;
};

type InteractionRow = {
  studentId: string;
  questionText: string;
  responseText: string;
  guardrailBlocked: boolean;
};

export type SubmissionsDeps = Pick<AssessmentDeps, 'findAssessment'> & {
  listAgendaIds(assessmentId: string): Promise<string[]>;
  listSubmissions(agendaId: string): Promise<SubmissionRow[]>;
  listInteractions(agendaId: string): Promise<InteractionRow[]>;
  findUserNames(ids: string[]): Promise<Map<string, string>>;
};

export type AssessmentSubmissionDTO = {
  agendaId: string;
  studentId: string;
  studentName: string;
  score: number;
  maxScore: number;
  submittedAt: Date;
  integrityLog: unknown;
  interactions: Pick<InteractionRow, 'questionText' | 'responseText' | 'guardrailBlocked'>[];
};

const defaultDeps: SubmissionsDeps = {
  findAssessment: assessmentRepo.findAssessmentWithPlan,
  listAgendaIds: assessmentRepo.listAgendaIdsByAssessment,
  listSubmissions: submissionRepo.listSubmissionsByAgenda,
  listInteractions: listInteractionsByAgenda,
  findUserNames: userRepo.findUserNamesByIds,
};

const UNKNOWN_STUDENT = 'Aluno desconhecido';

export async function listSubmissionsForAssessment(
  assessmentId: string,
  user: AssessmentActor,
  deps: SubmissionsDeps = defaultDeps
): Promise<AssessmentSubmissionDTO[]> {
  await loadOwnedAssessment(assessmentId, user, deps);
  const agendaIds = await deps.listAgendaIds(assessmentId);

  const perAgenda = await Promise.all(
    agendaIds.map(async (agendaId) => ({
      submissions: await deps.listSubmissions(agendaId),
      interactions: await deps.listInteractions(agendaId),
    }))
  );
  const studentIds = [...new Set(perAgenda.flatMap((a) => a.submissions.map((s) => s.studentId)))];
  const names = studentIds.length ? await deps.findUserNames(studentIds) : new Map<string, string>();

  return perAgenda.flatMap(({ submissions, interactions }) =>
    submissions.map((s) => ({
      agendaId: s.agendaId,
      studentId: s.studentId,
      studentName: names.get(s.studentId) ?? UNKNOWN_STUDENT,
      score: s.score,
      maxScore: s.maxScore,
      submittedAt: s.submittedAt,
      integrityLog: s.integrityLog ?? null,
      interactions: interactions
        .filter((i) => i.studentId === s.studentId)
        .map(({ questionText, responseText, guardrailBlocked }) => ({ questionText, responseText, guardrailBlocked })),
    }))
  );
}
