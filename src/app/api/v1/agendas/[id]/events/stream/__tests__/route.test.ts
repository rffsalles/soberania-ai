import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  openEventReader: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/classroom/class-event-service', () => ({
  openEventReader: mocks.openEventReader,
}));

import * as route from '../route';

const user = { id: 't1', role: Role.TEACHER, classId: null };
const ctx = { params: Promise.resolve({ id: 'ag1' }) };

function get(query = '', headers: Record<string, string> = {}, signal?: AbortSignal) {
  return route.GET(new Request(`http://x/api/v1/agendas/ag1/events/stream${query}`, { headers, signal }), ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLASS_EVENTS_STREAM_MAX_MS', '1');
  mocks.requireUser.mockResolvedValue(user);
});

describe('GET /api/v1/agendas/:id/events/stream', () => {
  it('exporta dynamic e runtime', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.runtime).toBe('nodejs');
  });

  it('Last-Event-ID vence ?after e os headers são de SSE', async () => {
    const read = vi.fn(async (after: number) => ({ events: [], lastSeq: after }));
    mocks.openEventReader.mockResolvedValue({ read });
    const res = await get('?after=2', { 'Last-Event-ID': '9' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(await res.text()).toContain('retry: 1000');
    expect(read.mock.calls[0][0]).toBe(9);
  });

  it('fora de escopo devolve 404 JSON antes de abrir o stream', async () => {
    mocks.openEventReader.mockRejectedValue(new DomainError(404, 'Agenda não encontrada'));
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});
