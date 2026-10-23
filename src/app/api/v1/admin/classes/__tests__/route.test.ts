import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listClasses: vi.fn(),
  createClass: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/domains/academic/services/class-service', () => ({
  listClasses: mocks.listClasses,
  createClass: mocks.createClass,
  updateClass: mocks.updateClass,
}));

import { POST, PUT } from '../route';

const admin = { id: 'a1', role: Role.ADMIN, classId: null };
const klass = { id: 'c9', name: 'Turma', code: 'T-2026-1', year: 2026, semester: 1 };

function req(method: 'POST' | 'PUT', body: unknown) {
  return new Request('http://x/api/v1/admin/classes', { method, body: JSON.stringify(body) });
}

describe('/api/v1/admin/classes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(admin);
  });

  it('POST cria a turma e devolve success', async () => {
    mocks.createClass.mockResolvedValue(klass);
    const res = await POST(req('POST', { name: 'Turma', code: 'T-2026-1', year: '2026', semester: '1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, class: klass });
    expect(mocks.createClass).toHaveBeenCalledWith({ name: 'Turma', code: 'T-2026-1', year: 2026, semester: 1 });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });

  it('POST devolve 400 com a primeira mensagem do zod', async () => {
    const res = await POST(req('POST', { name: 'T', code: 'T-2026-1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'Informe o nome da turma' });
    expect(mocks.createClass).not.toHaveBeenCalled();
  });

  it('PUT separa o id e chama updateClass', async () => {
    mocks.updateClass.mockResolvedValue(klass);
    const res = await PUT(req('PUT', { id: 'c9', name: 'Turma', code: 'T-2026-1', year: 2026, semester: 2 }));
    expect(res.status).toBe(200);
    expect(mocks.updateClass).toHaveBeenCalledWith('c9', { name: 'Turma', code: 'T-2026-1', year: 2026, semester: 2 });
  });
});
