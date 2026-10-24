'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { Question, Rubric } from '@/domains/assessments/question-schema';

const GENERIC_ERROR = 'Não foi possível concluir a operação. Tente novamente.';

export type PlanOption = {
  id: string;
  subject: { id: string; classId: string; discipline: { name: string; code: string }; class?: { id: string; name: string } | null };
  syllabus: string;
  unitsContent: unknown;
};

export type AssessmentAgenda = { id: string; classId: string; startTime: string; endTime: string };

export type AssessmentItem = {
  id: string;
  teachingPlanId: string;
  title: string;
  type: string;
  questions: Question[];
  rubrics: Rubric[];
  maxScore: number;
  durationMinutes: number;
  status: string;
  agendas: AssessmentAgenda[];
};

export type SubmissionItem = {
  agendaId: string;
  studentId: string;
  studentName: string;
  score: number;
  maxScore: number;
  submittedAt: string;
  integrityLog: unknown;
  interactions: { questionText: string; responseText: string; guardrailBlocked: boolean }[];
};

export type AssessmentDraft = {
  title: string;
  type: string;
  questions: Question[];
  rubrics: Rubric[];
  maxScore: number;
  durationMinutes: number;
};

export type GenerateInput = { teachingPlanId: string; unitNumbers: number[]; questionCount: number; type: string };
export type GeneratedAssessment = { questions: Question[]; rubrics: Rubric[]; fallback: boolean };

export const HTTP_CONFLICT = 409;

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** Chamada JSON que lança Error com a mensagem do servidor em caso de falha. */
export async function requestJson<T>(url: string, method: 'GET' | 'POST' | 'PUT', payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(payload === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new RequestError(typeof body?.error === 'string' ? body.error : GENERIC_ERROR, res.status);
  }
  return body as T;
}

function useRemote<T>(url: string | null, pick: (body: never) => T, empty: T) {
  const [state, setState] = React.useState({ data: empty, isLoading: url !== null, error: null as string | null });
  const [version, setVersion] = React.useState(0);
  const pickRef = React.useRef(pick);

  React.useEffect(() => {
    if (!url) {
      setState({ data: empty, isLoading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    requestJson<never>(url, 'GET')
      .then((body) => !cancelled && setState({ data: pickRef.current(body), isLoading: false, error: null }))
      .catch((err: Error) => !cancelled && setState({ data: empty, isLoading: false, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [url, version, empty]);

  const reload = React.useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

const NO_PLANS: PlanOption[] = [];
const NO_ASSESSMENTS: AssessmentItem[] = [];
const NO_SUBMISSIONS: SubmissionItem[] = [];

export function useTeacherPlans() {
  const { data, ...rest } = useRemote(API_ROUTES.TEACHER_PLANS, (b: { plans: PlanOption[] }) => b.plans, NO_PLANS);
  return { plans: data, ...rest };
}

export function useAssessments(planId: string | null) {
  const url = planId ? `${API_ROUTES.TEACHER_ASSESSMENTS}?planId=${encodeURIComponent(planId)}` : null;
  const { data, ...rest } = useRemote(url, (b: { assessments: AssessmentItem[] }) => b.assessments, NO_ASSESSMENTS);
  return { assessments: data, ...rest };
}

export function useSubmissions(assessmentId: string | null) {
  const url = assessmentId ? `${API_ROUTES.TEACHER_ASSESSMENTS}/${assessmentId}/submissions` : null;
  const { data, ...rest } = useRemote(url, (b: { submissions: SubmissionItem[] }) => b.submissions, NO_SUBMISSIONS);
  return { submissions: data, ...rest };
}

export async function saveAssessment(planId: string, existingId: string | null, draft: AssessmentDraft) {
  if (existingId) {
    await requestJson(`${API_ROUTES.TEACHER_ASSESSMENTS}/${existingId}`, 'PUT', draft);
    return;
  }
  await requestJson(API_ROUTES.TEACHER_ASSESSMENTS, 'POST', { teachingPlanId: planId, ...draft });
}

export async function generateAssessment(input: GenerateInput): Promise<GeneratedAssessment> {
  const body = await requestJson<{ data: GeneratedAssessment }>(`${API_ROUTES.TEACHER_ASSESSMENTS}/generate`, 'POST', input);
  return body.data;
}

export async function publishAssessment(id: string, input: { classId: string; startTime: string }) {
  await requestJson(`${API_ROUTES.TEACHER_ASSESSMENTS}/${id}/publish`, 'POST', input);
}
