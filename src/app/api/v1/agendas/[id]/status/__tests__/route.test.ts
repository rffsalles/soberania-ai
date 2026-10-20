import { describe, it, expect, vi } from 'vitest';
import { AgendaStatus, Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  setAgendaStatus: vi.fn(),
  generateMinutesForAgenda: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/domains/agendas/services/agenda-service', () => ({
  setAgendaStatus: mocks.setAgendaStatus,
}));
vi.mock('@/domains/pedagogy/services/minutes-service', () => ({
  generateMinutesForAgenda: mocks.generateMinutesForAgenda,
}));

import { PATCH } from '../route';

const user = { id: 't1', role: Role.TEACHER, classId: null };

function call(status: AgendaStatus) {
  return PATCH(
    new Request('http://x/api/v1/agendas/ag1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    {
      params: Promise.resolve({ id: 'ag1' }),
    }
  );
}

describe('PATCH /api/v1/agendas/:id/status', () => {
  it('COMPLETED gera atas e devolve o resultado', async () => {
    mocks.requireUser.mockResolvedValue(user);
    mocks.setAgendaStatus.mockResolvedValue({
      id: 'ag1',
      status: AgendaStatus.COMPLETED,
    });
    mocks.generateMinutesForAgenda.mockResolvedValue({
      generated: 2,
      failed: [],
    });
    const res = await call(AgendaStatus.COMPLETED);
    expect(res.status).toBe(200);
    expect((await res.json()).minutesResult).toEqual({
      generated: 2,
      failed: [],
    });
  });

  it('falha ao gerar atas não derruba a resposta com o novo status', async () => {
    mocks.requireUser.mockResolvedValue(user);
    mocks.setAgendaStatus.mockResolvedValue({
      id: 'ag1',
      status: AgendaStatus.COMPLETED,
    });
    mocks.generateMinutesForAgenda.mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(AgendaStatus.COMPLETED);
    expect(res.status).toBe(200);
    expect((await res.json()).agenda.status).toBe(AgendaStatus.COMPLETED);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('CANCELLED não gera atas', async () => {
    mocks.requireUser.mockResolvedValue(user);
    mocks.setAgendaStatus.mockResolvedValue({
      id: 'ag1',
      status: AgendaStatus.CANCELLED,
    });
    mocks.generateMinutesForAgenda.mockClear();
    const res = await call(AgendaStatus.CANCELLED);
    expect(res.status).toBe(200);
    expect(mocks.generateMinutesForAgenda).not.toHaveBeenCalled();
  });
});
