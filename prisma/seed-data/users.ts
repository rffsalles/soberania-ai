import { Role } from '@prisma/client';

export const DEMO_USERS = [
  {
    name: 'Administrador do Appliance',
    email: 'admin@soberania.edu.br',
    enrollment: 'ADM001',
    passwordPlain: 'admin123',
    role: Role.ADMIN,
  },
  {
    name: 'Prof. Carlos Silva',
    email: 'professor@soberania.edu.br',
    enrollment: 'PROF001',
    passwordPlain: 'prof123',
    role: Role.TEACHER,
  },
  {
    name: 'Maria Eduarda Santos',
    email: 'aluno@soberania.edu.br',
    enrollment: '202601001',
    passwordPlain: 'aluno123',
    role: Role.STUDENT,
  },
] as const;
