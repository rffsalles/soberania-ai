import { z } from 'zod';

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export const questionSchema = z.object({
  id: z.string(),
  enunciation: z.string().min(10),
  options: z.array(z.object({ key: z.enum(OPTION_KEYS), text: z.string().min(1) })).length(4),
  correctKey: z.enum(OPTION_KEYS),
  rationale: z.string(),
  topic: z.string(),
});

export const rubricSchema = z.object({
  criterion: z.string().min(1),
  description: z.string(),
  weight: z.number(),
});

export type Question = z.infer<typeof questionSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
