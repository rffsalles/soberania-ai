import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), generateUnitsFromDistribution: vi.fn() }));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({ ...(await importOriginal<object>()), requireUser: mocks.requireUser }));
vi.mock('@/domains/teaching/services/plan-units-service', () => ({ generateUnitsFromDistribution: mocks.generateUnitsFromDistribution }));

import { POST } from '../route';

const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const call = () => POST(new Request('http://x/api/v1/teacher/schedules/sch-1/generate-units', { method: 'POST' }), { params: Promise.resolve({ id: 'sch-1' }) });

describe('/api/v1/teacher/schedules/[id]/generate-units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacher);
  });

  it('POST delega com o usuário e devolve units', async () => {
    const units = [{ unitNumber: 1, title: 'U1', topics: ['a'], chapterIds: ['ch1'] }];
    mocks.generateUnitsFromDistribution.mockResolvedValue(units);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, units });
    expect(mocks.generateUnitsFromDistribution).toHaveBeenCalledWith('sch-1', teacher);
  });

  it('422 do service vira 422 com a mensagem', async () => {
    mocks.generateUnitsFromDistribution.mockRejectedValue(new DomainError(422, 'Distribua os capítulos'));
    const res = await call();
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain('Distribua os capítulos');
  });
});
