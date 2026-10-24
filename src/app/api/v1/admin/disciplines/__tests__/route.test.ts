import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listDisciplines: vi.fn(),
  createDiscipline: vi.fn(),
  updateDiscipline: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/domains/academic/services/discipline-service', () => ({
  listDisciplines: mocks.listDisciplines,
  createDiscipline: mocks.createDiscipline,
  updateDiscipline: mocks.updateDiscipline,
}));

import { GET, POST, PUT } from '../route';

const admin = { id: 'a1', role: Role.ADMIN, classId: null };
const discipline = { id: 'd1', courseId: 'co1', code: 'BD101', name: 'Banco de Dados I', description: null, workloadHours: 80 };

function req(method: 'POST' | 'PUT', body: unknown) {
  return new Request('http://x/api/v1/admin/disciplines', { method, body: JSON.stringify(body) });
}

describe('/api/v1/admin/disciplines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(admin);
  });

  it('GET exige ADMIN, filtra por courseId e devolve as disciplinas', async () => {
    mocks.listDisciplines.mockResolvedValue([discipline]);
    const res = await GET(new Request('http://x/api/v1/admin/disciplines?courseId=co1'));
    expect(await res.json()).toEqual({ success: true, disciplines: [discipline] });
    expect(mocks.listDisciplines).toHaveBeenCalledWith({ courseId: 'co1' });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });
  it('GET sem query lista sem filtro', async () => {
    mocks.listDisciplines.mockResolvedValue([]);
    await GET(new Request('http://x/api/v1/admin/disciplines'));
    expect(mocks.listDisciplines).toHaveBeenCalledWith({ courseId: undefined });
  });
  it('POST exige ADMIN e cria a disciplina', async () => {
    mocks.createDiscipline.mockResolvedValue(discipline);
    const body = { courseId: 'ccourse00001', code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 };
    const res = await POST(req('POST', body));
    expect(await res.json()).toEqual({ success: true, discipline });
    expect(mocks.createDiscipline).toHaveBeenCalledWith(body);
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });
  it('POST devolve 400 com a primeira mensagem do zod', async () => {
    const res = await POST(req('POST', { courseId: 'ccourse00001', code: 'BD101', name: 'Banco de Dados I', workloadHours: 0 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'A carga horária deve ser maior que zero' });
    expect(mocks.createDiscipline).not.toHaveBeenCalled();
  });
  it('PUT exige ADMIN, separa o id e descarta courseId', async () => {
    mocks.updateDiscipline.mockResolvedValue(discipline);
    const res = await PUT(req('PUT', { id: 'd1', courseId: 'ccourse00002', code: 'BD101', name: 'Banco de Dados I', workloadHours: '80' }));
    expect(await res.json()).toEqual({ success: true, discipline });
    expect(mocks.updateDiscipline).toHaveBeenCalledWith('d1', { code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });
});
