import { Role } from '@prisma/client';

/**
 * Fonte única dos usuários de demonstração: o seed (`npm run db:seed`) cria os usuários a partir
 * daqui e a tela de login usa os atalhos de matrícula/senha.
 */
export const DEMO_CREDENTIALS = [
  {
    role: Role.ADMIN,
    name: 'Administrador do Appliance',
    email: 'admin@soberania.edu.br',
    enrollment: 'ADM001',
    password: 'admin123',
    label: 'Administrador',
  },
  {
    role: Role.TEACHER,
    name: 'Prof. Carlos Silva',
    email: 'professor@soberania.edu.br',
    enrollment: 'PROF001',
    password: 'prof123',
    label: 'Professor',
  },
  {
    role: Role.STUDENT,
    name: 'Maria Eduarda Santos',
    email: 'aluno@soberania.edu.br',
    enrollment: '202601001',
    password: 'aluno123',
    label: 'Aluno',
  },
] as const;
