import { Role } from '@prisma/client';

export type UserRole = Role;

export interface AuthSessionPayload {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
  enrollment: string | null;
  sessionId: string;
  exp?: number;
  iat?: number;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  enrollment: string | null;
  avatarUrl: string | null;
  classId: string | null;
  sessionId: string;
}

export type ClassContext = {
  id: string;
  name: string;
  code: string;
  semester: number;
  course: { name: string; code: string };
  academicPeriod: { name: string; code: string };
};

/** Usuário como devolvido por /api/v1/auth/me: sessão + contexto da turma. */
export type CurrentUser = AuthenticatedUser & { class?: ClassContext | null };

export interface LoginResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
}
