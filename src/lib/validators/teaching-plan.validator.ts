import { z } from 'zod';

export const updateTeachingPlanSchema = z.object({
  subjectId: z.string().optional(),
  academicPeriodId: z.string().nullable().optional(),
  syllabus: z.string().optional(),
  generalObjectives: z.string().optional(),
  specificObjectives: z.string().optional(),
  unitsContent: z.array(z.any()).optional(),
  methodology: z.string().optional(),
  assessmentCriteria: z.string().optional(),
  basicBibliography: z.array(z.string()).optional(),
  complementaryBiblio: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED']).optional(),
  totalHours: z.number().int().positive().optional(),
  theoryHours: z.number().int().nonnegative().optional(),
  practiceHours: z.number().int().nonnegative().optional(),
  ndeComplianceStatus: z.string().optional(),
});

export type UpdateTeachingPlanInput = z.infer<typeof updateTeachingPlanSchema>;
