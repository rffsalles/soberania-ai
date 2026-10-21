import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const findActiveSession = vi.hoisted(() => vi.fn());
const findUserProfile = vi.hoisted(() => vi.fn());
vi.mock('@/domains/auth/services/session-repository', () => ({ findActiveSession }));
vi.mock('@/domains/auth/services/user-repository', () => ({ findUserProfile }));

import { getSessionUser } from '../session';
import { signAuthToken } from '../token';

const profile = (id: string) => ({
  id,
  name: 'Nome',
  email: `${id}@x.test`,
  role: Role.ADMIN,
  enrollment: null,
  avatarUrl: null,
  classId: null,
});

async function tokenFor(sub: string, sessionId: string) {
  return signAuthToken({ sub, name: 'n', email: 'e', role: Role.STUDENT, enrollment: null, sessionId });
}

describe('getSessionUser', () => {
  beforeEach(() => {
    findActiveSession.mockReset();
    findUserProfile.mockReset();
    findUserProfile.mockImplementation(async (id: string) => profile(id));
  });

  it('devolve o usuário quando a sessão ativa pertence ao sub do token', async () => {
    findActiveSession.mockResolvedValue({ id: 'sess1', userId: 'u1' });
    const user = await getSessionUser(await tokenFor('u1', 'sess1'));
    expect(user).toMatchObject({ id: 'u1', sessionId: 'sess1' });
  });

  it('devolve null quando a sessão pertence a outro usuário', async () => {
    findActiveSession.mockResolvedValue({ id: 'sess1', userId: 'u1' });
    expect(await getSessionUser(await tokenFor('admin-1', 'sess1'))).toBeNull();
    expect(findUserProfile).not.toHaveBeenCalled();
  });

  it('devolve null quando a sessão não está ativa', async () => {
    findActiveSession.mockResolvedValue(null);
    expect(await getSessionUser(await tokenFor('u1', 'sess1'))).toBeNull();
  });
});
