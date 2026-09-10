import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Informe sua matrícula acadêmica ou e-mail institucional')
    .trim(),
  password: z
    .string()
    .min(1, 'Informe sua senha de acesso'),
});

export type LoginInput = z.infer<typeof loginSchema>;
