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
  // Sem default: editar sem turma preserva o ano letivo salvo.
  academicYear: z.coerce.number().int().optional(),
  id: z.string().min(1, 'ID é obrigatório'),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpsertSubjectInput = z.infer<typeof upsertSubjectSchema>;

export const createClassSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da turma'),
  code: z.string().trim().min(2, 'Informe o código da turma'),
  year: z.coerce.number().int('Informe um ano válido').min(2020, 'Informe um ano entre 2020 e 2050').max(2050, 'Informe um ano entre 2020 e 2050').default(() => new Date().getFullYear()),
  semester: z.coerce.number().int('Informe um semestre válido').min(1, 'Informe um semestre entre 1 e 4').max(4, 'Informe um semestre entre 1 e 4').default(1),
});
export const updateClassSchema = createClassSchema.extend({ id: z.string().min(1, 'ID é obrigatório') });
export type CreateClassInput = z.infer<typeof createClassSchema>;

const academicLevel = z.enum(['HIGHER_EDUCATION', 'HIGH_SCHOOL', 'ELEMENTARY']);

export const createCourseSchema = z.object({
  name: z.string({ required_error: 'Informe o nome do curso' }).trim().min(2, 'Informe o nome do curso'),
  code: z.string({ required_error: 'Informe o código do curso' }).trim().min(2, 'Informe o código do curso'),
  academicLevel: academicLevel.default('HIGHER_EDUCATION'),
});
export const updateCourseSchema = createCourseSchema.extend({ id: z.string({ required_error: 'ID é obrigatório' }).min(1, 'ID é obrigatório') });
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
