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

export interface LoginResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
}
