import {
  createUser,
  findUserByEmailOrEnrollment,
  setUserPasswordHash,
} from '@/domains/auth/services/user-repository';
import { hashPassword } from './password';
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

/**
 * Garante que os usuários de teste institucionais existem no banco com hashes seguros.
 */
export async function ensureDemoUsersExist(): Promise<void> {
  for (const demo of DEMO_USERS) {
    const existing = await findUserByEmailOrEnrollment(demo.email, demo.enrollment);

    const passwordHash = await hashPassword(demo.passwordPlain);

    if (!existing) {
      await createUser({
        name: demo.name,
        email: demo.email,
        enrollment: demo.enrollment,
        passwordHash,
        role: demo.role,
      });
    } else if (!existing.passwordHash) {
      await setUserPasswordHash(existing.id, passwordHash);
    }
  }
}
