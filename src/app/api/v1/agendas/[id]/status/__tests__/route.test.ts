import { describe, it, expect, vi } from 'vitest';
import { AgendaStatus, Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  setAgendaStatus: vi.fn(),
  generateMinutesForAgenda: vi.fn(),
  closeClassIfRunning: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({
  requireUser: mocks.requireUser,
  AuthError: class AuthError extends Error {
    status = 401;
  },
}));
vi.mock('@/domains/agendas/services/agenda-service', () => ({
  setAgendaStatus: mocks.setAgendaStatus,
}));
vi.mock('@/domains/pedagogy/services/minutes-service', () => ({
  generateMinutesForAgenda: mocks.generateMinutesForAgenda,
}));

vi.mock('@/domains/classroom/class-event-service', () => ({
  closeClassIfRunning: mocks.closeClassIfRunning,
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

describe('PATCH status: encerramento da aula ao vivo', () => {
  it.each([AgendaStatus.COMPLETED, AgendaStatus.CANCELLED])('%s fecha a aula em andamento', async (status) => {
    mocks.requireUser.mockResolvedValue(user);
    mocks.setAgendaStatus.mockResolvedValue({ id: 'ag1', status });
    mocks.generateMinutesForAgenda.mockResolvedValue({ generated: 0, failed: [] });
    mocks.closeClassIfRunning.mockReset().mockResolvedValue(true);
    const res = await call(status);
    expect(res.status).toBe(200);
    expect(mocks.closeClassIfRunning).toHaveBeenCalledWith('ag1');
  });

  it('LIVE (fora do schema) é rejeitado e não fecha a aula', async () => {
    mocks.requireUser.mockResolvedValue(user);
    mocks.closeClassIfRunning.mockReset();
    const res = await call(AgendaStatus.LIVE);
    expect(res.status).toBe(400);
    expect(mocks.closeClassIfRunning).not.toHaveBeenCalled();
  });

  it('falha ao fechar a aula não derruba a resposta', async () => {
    mocks.requireUser.mockResolvedValue(user);
    mocks.setAgendaStatus.mockResolvedValue({ id: 'ag1', status: AgendaStatus.CANCELLED });
    mocks.closeClassIfRunning.mockReset().mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(AgendaStatus.CANCELLED);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
