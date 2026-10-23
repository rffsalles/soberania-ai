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
  academicYear: z.coerce.number().int().default(() => new Date().getFullYear()),
  teacherIds: z.array(z.string()).default([]),
  // Turma que recebe as agendas da disciplina; null desvincula, ausente mantém a atual.
  classId: z.string().cuid('Turma inválida').nullable().optional(),
});

export const updateSubjectSchema = upsertSubjectSchema.extend({
  id: z.string().min(1, 'ID é obrigatório'),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpsertSubjectInput = z.infer<typeof upsertSubjectSchema>;

export const createClassSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da turma'),
  code: z.string().trim().min(2, 'Informe o código da turma'),
  year: z.coerce.number().int().min(2020).max(2050).default(() => new Date().getFullYear()),
  semester: z.coerce.number().int().min(1).max(4).default(1),
});
export const updateClassSchema = createClassSchema.extend({ id: z.string().min(1, 'ID é obrigatório') });
export type CreateClassInput = z.infer<typeof createClassSchema>;
