import { Role } from '@prisma/client';

/** Credenciais dos usuários criados por `npm run db:seed`, usadas nos atalhos da tela de login. */
export const DEMO_CREDENTIALS = [
  { role: Role.ADMIN, enrollment: 'ADM001', password: 'admin123', label: 'Administrador' },
  { role: Role.TEACHER, enrollment: 'PROF001', password: 'prof123', label: 'Professor' },
  { role: Role.STUDENT, enrollment: '202601001', password: 'aluno123', label: 'Aluno' },
] as const;
