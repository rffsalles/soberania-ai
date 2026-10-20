import { z } from 'zod';

export const submitDraftSchema = z.object({
  agendaId: z.string().min(1),
  content: z.string().optional(),
});

export const listDraftsQuerySchema = z.object({
  agendaId: z.string().min(1),
});

export type SubmitDraftInput = z.infer<typeof submitDraftSchema>;
