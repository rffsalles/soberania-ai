import { z } from 'zod';

import { questionSchema } from '@/domains/assessments/question-schema';
import { TIME_SCRIPT_MAX_ITEMS } from '@/domains/teaching/time-script';

export const CLASS_EVENT_TYPES = [
  'STEP_CHANGED',
  'TUTOR_CARD',
  'TUTOR_QUESTION',
  'TEACHER_NOTE',
  'SESSION_STARTED',
  'SESSION_ENDED',
  'TUTOR_SKIPPED',
] as const;

export type ClassEventTypeName = (typeof CLASS_EVENT_TYPES)[number];

/** Tipos que o professor pode gravar pela API; os da tutora nascem só no servidor. */
export const TEACHER_WRITABLE_TYPES: readonly ClassEventTypeName[] = [
  'STEP_CHANGED',
  'TEACHER_NOTE',
  'SESSION_STARTED',
  'SESSION_ENDED',
];

export type ClassEventDTO = {
  seq: number;
  type: ClassEventTypeName;
  stepIndex: number | null;
  payload: unknown;
  createdBy: 'TEACHER' | 'TUTOR' | 'SYSTEM';
  createdAt: string;
};

const emptyPayload = z.object({}).strict();

const stepChangedPayload = z.object({
  activity: z.string().min(1).max(200),
  timeRange: z.string().max(40),
  fromStepIndex: z.number().int().min(0).nullable(),
  videoSeconds: z.number().int().min(0).optional(),
});

const conceptSchema = z.object({
  title: z.string().min(1).max(80),
  explanation: z.string().min(1).max(400),
  citation: z.object({
    chunkId: z.string().min(1),
    label: z.string().min(1).max(200),
    page: z.number().int().min(1).nullable(),
  }),
});

const tutorCardPayload = z.object({
  concepts: z.array(conceptSchema).min(2).max(3),
  objectiveLink: z.string().min(1).max(300),
  source: z.enum(['GENERATED', 'DRAFT']),
});

const tutorQuestionPayload = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('MULTIPLE_CHOICE'),
    question: questionSchema,
    origin: z.literal('TUTOR'),
    source: z.enum(['GENERATED', 'DRAFT']),
  }),
  z.object({
    kind: z.literal('OPEN'),
    text: z.string().min(1).max(500),
    origin: z.literal('TEACHER'),
  }),
]);

const teacherNotePayload = z.object({
  tutor: z.enum(['MUTE', 'UNMUTE', 'PUBLISH_NOW']).nullable(),
  scope: z.enum(['STEP', 'LESSON']),
  text: z.string().max(500).optional(),
});

const tutorSkippedPayload = z.object({
  reason: z.enum(['NO_MATERIAL', 'RATE_LIMIT', 'BUDGET', 'PROVIDER_ERROR']),
  kind: z.enum(['CARD', 'QUESTION', 'BOTH']),
});

const PAYLOAD_SCHEMAS: Record<ClassEventTypeName, z.ZodType> = {
  STEP_CHANGED: stepChangedPayload,
  TUTOR_CARD: tutorCardPayload,
  TUTOR_QUESTION: tutorQuestionPayload,
  TEACHER_NOTE: teacherNotePayload,
  SESSION_STARTED: emptyPayload,
  SESSION_ENDED: emptyPayload,
  TUTOR_SKIPPED: tutorSkippedPayload,
};

function isClassEventType(type: string): type is ClassEventTypeName {
  return (CLASS_EVENT_TYPES as readonly string[]).includes(type);
}

function stepIndexError(
  type: ClassEventTypeName,
  payload: unknown,
  stepIndex: number | null,
): string | null {
  const inRange =
    stepIndex !== null &&
    Number.isInteger(stepIndex) &&
    stepIndex >= 0 &&
    stepIndex <= TIME_SCRIPT_MAX_ITEMS - 1;

  if (type === 'SESSION_STARTED' || type === 'SESSION_ENDED') {
    return stepIndex === null ? null : 'stepIndex deve ser nulo neste tipo';
  }
  const required =
    type === 'STEP_CHANGED' ||
    type === 'TUTOR_CARD' ||
    type === 'TUTOR_QUESTION' ||
    type === 'TUTOR_SKIPPED' ||
    (type === 'TEACHER_NOTE' && (payload as { scope?: string }).scope === 'STEP');
  if (required && !inRange) return `stepIndex obrigatório entre 0 e ${TIME_SCRIPT_MAX_ITEMS - 1}`;
  if (!required && stepIndex !== null && !inRange) return 'stepIndex fora do intervalo';
  return null;
}

export function parseClassEvent(
  type: string,
  payload: unknown,
  stepIndex: number | null,
): { ok: true; payload: unknown } | { ok: false; error: string } {
  if (!isClassEventType(type)) return { ok: false, error: `Tipo de evento desconhecido: ${type}` };
  const parsed = PAYLOAD_SCHEMAS[type].safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  const stepError = stepIndexError(type, parsed.data, stepIndex);
  if (stepError) return { ok: false, error: stepError };
  return { ok: true, payload: parsed.data };
}

/** Remove o gabarito (correctKey, rationale) da pergunta de múltipla escolha. */
export function projectForStudent(e: ClassEventDTO): ClassEventDTO {
  if (e.type !== 'TUTOR_QUESTION') return e;
  const payload = e.payload as { kind?: string; question?: Record<string, unknown> } | null;
  if (!payload || payload.kind !== 'MULTIPLE_CHOICE' || !payload.question) return e;
  const { correctKey: _correctKey, rationale: _rationale, ...publicQuestion } = payload.question;
  return { ...e, payload: { ...payload, question: publicQuestion } };
}

/** Audiences que o leitor enxerga: ALL, mais TEACHER (professor/admin) ou o próprio id (aluno). */
export function audiencesFor(actor: { id: string; role: string }): string[] {
  return actor.role === 'TEACHER' || actor.role === 'ADMIN' ? ['ALL', 'TEACHER'] : ['ALL', actor.id];
}
