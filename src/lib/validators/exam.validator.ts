import { z } from 'zod';
import { OPTION_KEYS } from '@/domains/assessments/question-schema';

export const submitExamSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      chosenKey: z.enum(OPTION_KEYS),
      timeSpentSeconds: z.number().int().min(0),
    })
  ),
  integrityLog: z.object({
    blurEvents: z.number().int().min(0),
    guardrailBlocks: z.number().int().min(0),
  }),
});

export type SubmitExamInput = z.infer<typeof submitExamSchema>;
