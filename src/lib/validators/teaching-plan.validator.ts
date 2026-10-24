import { z } from 'zod';

export const updateTeachingPlanSchema = z.object({
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

// Horas: a UI envia null/string quando vazio; a regra e a mensagem pt-BR ficam em createPlan.
const hoursInput = z.union([z.number(), z.string()]).nullable().optional();

export const createTeachingPlanSchema = updateTeachingPlanSchema.extend({
  subjectId: z.string({ required_error: 'Selecione a oferta' }).min(1, 'Selecione a oferta'),
  syllabus: z.string({ required_error: 'Informe a ementa' }).min(1, 'Informe a ementa'),
  totalHours: hoursInput,
  theoryHours: hoursInput,
  practiceHours: hoursInput,
});

export type CreateTeachingPlanInput = z.infer<typeof createTeachingPlanSchema>;
export type UpdateTeachingPlanInput = z.infer<typeof updateTeachingPlanSchema>;
