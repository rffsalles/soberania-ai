import { z } from 'zod';

export const chatRequestSchema = z.object({
  agendaId: z.string().min(1, 'Parâmetro agendaId é obrigatório.'),
  message: z.string().min(1, 'Parâmetro message é obrigatório.'),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional(),
  videoTimestampSeconds: z.number().optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
