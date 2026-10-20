import { z } from 'zod';
import { questionSchema, rubricSchema } from '@/domains/assessments/question-schema';

export const MAX_QUESTION_COUNT = 20;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 300;

export const generateAssessmentSchema = z.object({
  teachingPlanId: z.string().min(1),
  unitNumbers: z.array(z.number().int()).min(1),
  questionCount: z.number().int().min(1).max(MAX_QUESTION_COUNT),
  type: z.string().min(1),
});

export const updateAssessmentSchema = z.object({
  title: z.string().min(3).optional(),
  type: z.string().min(1).optional(),
  questions: z.array(questionSchema).optional(),
  rubrics: z.array(rubricSchema).optional(),
  durationMinutes: z.number().int().min(MIN_DURATION_MINUTES).max(MAX_DURATION_MINUTES).optional(),
  maxScore: z.number().positive().optional(),
});

export const publishAssessmentSchema = z.object({
  classId: z.string().min(1),
  startTime: z.string().datetime({ offset: true }),
});

export type GenerateAssessmentInput = z.infer<typeof generateAssessmentSchema>;
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
export type PublishAssessmentInput = z.infer<typeof publishAssessmentSchema>;
