import { z } from 'zod';
import { DRAFT_MAX_CHARS } from '@/lib/constants/assessments';

export const submitDraftSchema = z.object({
  agendaId: z.string().min(1),
  content: z.string().max(DRAFT_MAX_CHARS, 'Texto excede o limite de 20.000 caracteres.').optional(),
});

export const listDraftsQuerySchema = z.object({
  agendaId: z.string().min(1),
});

export type SubmitDraftInput = z.infer<typeof submitDraftSchema>;
