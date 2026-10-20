import { describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import { AuthError, createRequestUserReader } from '../request-user';
import { AUTH_COOKIE_NAME } from '../rbac';
import type { AuthenticatedUser } from '../types';

const teacher: AuthenticatedUser = {
  id: 'u1',
  name: 'Prof',
  email: 'p@x.com',
  role: Role.TEACHER,
  enrollment: null,
  avatarUrl: null,
  classId: null,
  sessionId: 's1',
};

function reqWith(cookie?: string): Request {
  return new Request('http://localhost/api/v1/x', {
    headers: cookie ? { cookie } : {},
  });
}

async function status(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e instanceof AuthError ? e.status : 'other';
  }
  return null;
}

describe('requireUser', () => {
  it('401 sem cookie', async () => {
    const getSessionUser = vi.fn();
    const { requireUser } = createRequestUserReader({ getSessionUser });
    expect(await status(requireUser(reqWith()))).toBe(401);
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it('401 (não 500) quando o cookie tem encoding malformado', async () => {
    const getSessionUser = vi.fn();
    const { requireUser } = createRequestUserReader({ getSessionUser });
    expect(await status(requireUser(reqWith(`${AUTH_COOKIE_NAME}=%E0%A4%A`)))).toBe(401);
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it('401 quando a sessão foi revogada', async () => {
    const { requireUser } = createRequestUserReader({ getSessionUser: async () => null });
    expect(await status(requireUser(reqWith(`${AUTH_COOKIE_NAME}=tok`)))).toBe(401);
  });

  it('403 quando o papel não é permitido', async () => {
    const { requireUser } = createRequestUserReader({ getSessionUser: async () => teacher });
    expect(await status(requireUser(reqWith(`${AUTH_COOKIE_NAME}=tok`), [Role.ADMIN]))).toBe(403);
  });

  it('devolve o usuário quando ok', async () => {
    const getSessionUser = vi.fn(async () => teacher);
    const { requireUser } = createRequestUserReader({ getSessionUser });
    const user = await requireUser(
      reqWith(`other=1; ${AUTH_COOKIE_NAME}=tok; x=2`),
      [Role.TEACHER, Role.ADMIN]
    );
    expect(user).toEqual(teacher);
    expect(getSessionUser).toHaveBeenCalledWith('tok');
  });
});
