import { z } from 'zod';

export const createTeacherSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo'),
  email: z.string().trim().email('E-mail inválido').toLowerCase(),
  enrollment: z.string().trim().min(3, 'Informe a matrícula'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
});

export const upsertSubjectSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da disciplina'),
  code: z.string().trim().min(2, 'Informe o código'),
  courseName: z.string().trim().min(2, 'Informe o curso'),
  description: z.string().optional(),
  academicLevel: z
    .enum(['HIGHER_EDUCATION', 'HIGH_SCHOOL', 'ELEMENTARY'])
    .default('HIGHER_EDUCATION'),
  academicYear: z.coerce.number().int().default(2026),
  teacherIds: z.array(z.string()).default([]),
});

export const updateSubjectSchema = upsertSubjectSchema.extend({
  id: z.string().min(1, 'ID é obrigatório'),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpsertSubjectInput = z.infer<typeof upsertSubjectSchema>;
