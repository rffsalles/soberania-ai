import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), distributeChapters: vi.fn() }));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({ ...(await importOriginal<object>()), requireUser: mocks.requireUser }));
vi.mock('@/domains/teaching/services/chapter-distribution-service', () => ({ distributeChapters: mocks.distributeChapters }));

import { POST } from '../route';

const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const call = () => POST(new Request('http://x/api/v1/teacher/schedules/sch-1/distribute-chapters', { method: 'POST' }), { params: Promise.resolve({ id: 'sch-1' }) });

describe('/api/v1/teacher/schedules/[id]/distribute-chapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacher);
  });

  it('POST delega a distributeChapters com o usuário e devolve result', async () => {
    mocks.distributeChapters.mockResolvedValue({ updated: 5, skippedPublished: 1 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, result: { updated: 5, skippedPublished: 1 } });
    expect(mocks.distributeChapters).toHaveBeenCalledWith('sch-1', teacher);
  });

  it('503 do service vira resposta 503 com a mensagem', async () => {
    mocks.distributeChapters.mockRejectedValue(new DomainError(503, 'IA indisponível'));
    const res = await call();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).toContain('IA indisponível');
  });
});
