import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), prepareTutorDraft: vi.fn(), listTutorDrafts: vi.fn() }));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/classroom/tutor-draft-service', () => ({
  prepareTutorDraft: mocks.prepareTutorDraft,
  listTutorDrafts: mocks.listTutorDrafts,
}));

import { GET, POST } from '../route';

const ctx = { params: Promise.resolve({ id: 'lp1' }) };
const user = { id: 't1', role: Role.TEACHER, classId: null };
const post = (body: unknown) =>
  new Request('http://x/api/v1/teacher/lessons/lp1/tutor-drafts', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
});

describe('tutor-drafts route', () => {
  it('POST repassa stepIndex e devolve step', async () => {
    const step = { stepIndex: 2, status: 'READY', card: true, question: false, message: null };
    mocks.prepareTutorDraft.mockResolvedValue(step);
    const res = await POST(post({ stepIndex: 2 }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, step });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.any(Request), [Role.TEACHER, Role.ADMIN]);
    expect(mocks.prepareTutorDraft).toHaveBeenCalledWith(user, 'lp1', 2);
  });

  it.each([{}, { stepIndex: -1 }, { stepIndex: 1.5 }, { stepIndex: '1' }, 'não-json'])(
    'POST corpo inválido %j: 400',
    async (body) => {
      const res = await POST(post(body), ctx);
      expect(res.status).toBe(400);
      expect(mocks.prepareTutorDraft).not.toHaveBeenCalled();
    },
  );

  it('GET devolve drafts', async () => {
    const drafts = [{ stepIndex: 0, card: null, question: null, current: true }];
    mocks.listTutorDrafts.mockResolvedValue(drafts);
    const res = await GET(new Request('http://x/api/v1/teacher/lessons/lp1/tutor-drafts'), ctx);
    expect(await res.json()).toEqual({ success: true, drafts });
    expect(mocks.listTutorDrafts).toHaveBeenCalledWith(user, 'lp1');
  });

  it('papel não permitido: o erro do requireUser vira resposta', async () => {
    const { AuthError } = await import('@/lib/auth/request-user');
    mocks.requireUser.mockRejectedValue(new AuthError(403, 'Acesso negado'));
    expect((await GET(new Request('http://x/y'), ctx)).status).toBe(403);
    expect((await POST(post({ stepIndex: 0 }), ctx)).status).toBe(403);
    expect(mocks.prepareTutorDraft).not.toHaveBeenCalled();
  });
});
