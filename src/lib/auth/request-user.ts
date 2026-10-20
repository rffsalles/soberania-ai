import type { Role } from '@prisma/client';
import { AUTH_COOKIE_NAME } from './rbac';
import { getSessionUser } from './session';
import type { AuthenticatedUser } from './types';

export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface RequestUserDeps {
  getSessionUser: (token: string) => Promise<AuthenticatedUser | null>;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      const value = part.slice(idx + 1).trim();
      if (!value) return null;
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function createRequestUserReader(deps: RequestUserDeps) {
  async function getRequestUser(req: Request): Promise<AuthenticatedUser | null> {
    const token = readCookie(req, AUTH_COOKIE_NAME);
    if (!token) return null;
    return deps.getSessionUser(token);
  }

  async function requireUser(req: Request, roles?: Role[]): Promise<AuthenticatedUser> {
    const user = await getRequestUser(req);
    if (!user) throw new AuthError(401, 'Não autenticado');
    if (roles && !roles.includes(user.role)) throw new AuthError(403, 'Acesso negado');
    return user;
  }

  return { getRequestUser, requireUser };
}

export const { getRequestUser, requireUser } = createRequestUserReader({ getSessionUser });
