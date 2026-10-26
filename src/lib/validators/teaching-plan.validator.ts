import { z } from 'zod';

export const planReferenceSchema = z.object({
  materialId: z.string().min(1),
  kind: z.enum(['BASIC', 'COMPLEMENTARY']),
});

export const planUnitSchema = z.object({
  unitNumber: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  topics: z.array(z.string().trim().min(1)),
  chapterIds: z.array(z.string()).optional(),
});

export type PlanUnit = z.infer<typeof planUnitSchema>;

export const updateTeachingPlanSchema = z.object({
  syllabus: z.string().optional(),
  generalObjectives: z.string().optional(),
  specificObjectives: z.string().optional(),
  unitsContent: z.array(planUnitSchema).optional(),
  methodology: z.string().optional(),
  assessmentCriteria: z.string().optional(),
  basicBibliography: z.array(z.string()).optional(),
  complementaryBiblio: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED']).optional(),
  theoryHours: z.number().int().nonnegative().optional(),
  practiceHours: z.number().int().nonnegative().optional(),
  ndeComplianceStatus: z.string().optional(),
  references: z.array(planReferenceSchema).max(100).optional(),
});

// A carga total não é entrada: vem da matriz (Discipline.workloadHours). Horas: a UI envia null/string quando vazio; a regra e a mensagem pt-BR ficam em createPlan.
const hoursInput = z.union([z.number(), z.string()]).nullable().optional();

export const createTeachingPlanSchema = updateTeachingPlanSchema.extend({
  subjectId: z.string({ required_error: 'Selecione a oferta' }).min(1, 'Selecione a oferta'),
  syllabus: z.string({ required_error: 'Informe a ementa' }).min(1, 'Informe a ementa'),
  theoryHours: hoursInput,
  practiceHours: hoursInput,
});

export type PlanReferenceInput = z.infer<typeof planReferenceSchema>;
export type CreateTeachingPlanInput = z.infer<typeof createTeachingPlanSchema>;
export type UpdateTeachingPlanInput = z.infer<typeof updateTeachingPlanSchema>;
