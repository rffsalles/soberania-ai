import { z } from 'zod';

import { OPTION_KEYS } from '@/lib/constants/assessments';

export const questionSchema = z.object({
  id: z.string(),
  enunciation: z.string().min(10),
  options: z.array(z.object({ key: z.enum(OPTION_KEYS), text: z.string().min(1) })).length(4),
  correctKey: z.enum(OPTION_KEYS),
  rationale: z.string(),
  topic: z.string(),
  chapterId: z.string().optional(),
});

export const rubricSchema = z.object({
  criterion: z.string().min(1),
  description: z.string(),
  weight: z.number(),
});

export type Question = z.infer<typeof questionSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
