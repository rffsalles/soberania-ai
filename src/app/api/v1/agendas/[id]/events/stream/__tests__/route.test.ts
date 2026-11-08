import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  openEventReader: vi.fn(),
  isClassClosed: vi.fn(),
  subscribe: vi.fn(),
  stalledTutorStepFor: vi.fn(),
  runTutorForStepSafely: vi.fn(),
  after: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('@/domains/classroom/tutor-step-worker', () => ({
  runTutorForStepSafely: mocks.runTutorForStepSafely,
}));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/classroom/class-event-service', () => ({
  openEventReader: mocks.openEventReader,
  isClassClosed: mocks.isClassClosed,
  stalledTutorStepFor: mocks.stalledTutorStepFor,
}));

vi.mock('@/domains/classroom/class-event-listener', () => ({
  getClassEventListener: () => ({ subscribe: mocks.subscribe }),
}));

import * as route from '../route';

const user = { id: 't1', role: Role.TEACHER, classId: null };
const ctx = { params: Promise.resolve({ id: 'ag1' }) };

function get(query = '', headers: Record<string, string> = {}, signal?: AbortSignal) {
  return route.GET(new Request(`http://x/api/v1/agendas/ag1/events/stream${query}`, { headers, signal }), ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLASS_EVENTS_STREAM_MAX_MS', '0');
  mocks.requireUser.mockResolvedValue(user);
  mocks.isClassClosed.mockResolvedValue(false);
  mocks.stalledTutorStepFor.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/v1/agendas/:id/events/stream', () => {
  it('exporta dynamic e runtime', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.runtime).toBe('nodejs');
  });

  it('Last-Event-ID vence ?after e os headers são de SSE', async () => {
    const ac = new AbortController();
    const read = vi.fn(async (after: number) => {
      ac.abort();
      return { events: [], lastSeq: after };
    });
    mocks.openEventReader.mockResolvedValue({ read });
    const res = await get('?after=2', { 'Last-Event-ID': '9' }, ac.signal);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(await res.text()).toContain('retry: 1000');
    expect(read.mock.calls[0][0]).toBe(9);
  });

  it('aula encerrada devolve 204 sem corpo e não abre o leitor', async () => {
    mocks.isClassClosed.mockResolvedValue(true);
    const res = await get('?after=4', { 'Last-Event-ID': '6' });
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(mocks.isClassClosed).toHaveBeenCalledWith(user, 'ag1', 6);
    expect(mocks.openEventReader).not.toHaveBeenCalled();
  });

  it('escopo negado em isClassClosed devolve 404 JSON', async () => {
    mocks.isClassClosed.mockRejectedValue(new DomainError(404, 'Agenda não encontrada'));
    const res = await get();
    expect(res.status).toBe(404);
  });

  it('fora de escopo devolve 404 JSON antes de abrir o stream', async () => {
    mocks.openEventReader.mockRejectedValue(new DomainError(404, 'Agenda não encontrada'));
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('sem permissão devolve 403 JSON', async () => {
    mocks.openEventReader.mockRejectedValue(new DomainError(403, 'Sem acesso'));
    const res = await get();
    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('modo listen: usa subscribe e fecha a assinatura ao encerrar', async () => {
    vi.stubEnv('CLASS_EVENTS_NOTIFY_MODE', 'listen');
    const ac = new AbortController();
    const close = vi.fn();
    const wait = vi.fn(async () => undefined);
    mocks.subscribe.mockReturnValue({ wait, close });
    mocks.openEventReader.mockResolvedValue({
      read: async (after: number) => {
        ac.abort();
        return { events: [], lastSeq: after };
      },
    });
    const res = await get('', {}, ac.signal);
    await res.text();
    expect(mocks.subscribe).toHaveBeenCalledWith('ag1');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('modo poll: não toca no ouvinte', async () => {
    const ac = new AbortController();
    mocks.openEventReader.mockResolvedValue({
      read: async (after: number) => {
        ac.abort();
        return { events: [], lastSeq: after };
      },
    });
    await (await get('', {}, ac.signal)).text();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('passo parado dispara o worker direto, sem after()', async () => {
    mocks.stalledTutorStepFor.mockResolvedValue(2);
    const ac = new AbortController();
    mocks.openEventReader.mockResolvedValue({
      read: async (after: number) => {
        ac.abort();
        return { events: [], lastSeq: after };
      },
    });
    await (await get('', {}, ac.signal)).text();
    expect(mocks.runTutorForStepSafely).toHaveBeenCalledWith('ag1', 2);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('sem passo parado não dispara o worker', async () => {
    const ac = new AbortController();
    mocks.openEventReader.mockResolvedValue({
      read: async (after: number) => {
        ac.abort();
        return { events: [], lastSeq: after };
      },
    });
    await (await get('', {}, ac.signal)).text();
    expect(mocks.runTutorForStepSafely).not.toHaveBeenCalled();
  });
});
