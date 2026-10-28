import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listStudentChatHistory: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/agents/services/chat-history-service', () => ({
  listStudentChatHistory: mocks.listStudentChatHistory,
}));

import { GET } from '../route';

const user = { id: 's1', role: Role.STUDENT, classId: 'c1' };
const call = () =>
  GET(new Request('http://x/api/v1/agendas/ag1/interactions'), { params: Promise.resolve({ id: 'ag1' }) });

describe('GET /api/v1/agendas/:id/interactions', () => {
  it('responde { items } do service com o usuário e a agenda', async () => {
    mocks.requireUser.mockResolvedValue(user);
    const items = [{ id: 'i1', question: 'q', answer: 'a', citation: null, guardrailBlocked: false, createdAt: 'x' }];
    mocks.listStudentChatHistory.mockResolvedValue(items);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items });
    expect(mocks.listStudentChatHistory).toHaveBeenCalledWith(user, 'ag1');
  });

  it('DomainError vira o status correspondente', async () => {
    mocks.requireUser.mockResolvedValue(user);
    mocks.listStudentChatHistory.mockRejectedValue(new DomainError(404, 'Agenda não encontrada.'));
    const res = await call();
    expect(res.status).toBe(404);
  });
});
