import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { AuthError } from '@/lib/auth/request-user';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listMaterialChapters: vi.fn(),
  replaceManualChapters: vi.fn(),
  reextractMaterialChapters: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/rag/services/chapter-extraction-service', () => ({
  listMaterialChapters: mocks.listMaterialChapters,
  replaceManualChapters: mocks.replaceManualChapters,
  reextractMaterialChapters: mocks.reextractMaterialChapters,
}));

import { GET, PUT } from '../route';
import { POST } from '../extract/route';

const props = { params: Promise.resolve({ id: 'm1' }) };
const put = (body: unknown) =>
  new Request('http://x/api/v1/library/materials/m1/chapters', { method: 'PUT', body: JSON.stringify(body) });

describe('rotas de capítulos do material', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: 't1', role: Role.TEACHER, classId: null });
  });

  it('PUT com startPage não inteiro devolve 400 e não chama o service', async () => {
    const res = await PUT(put({ chapters: [{ title: 'Cap 1', startPage: 1.5 }] }), props);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Capítulos inválidos: informe título e página inicial de cada capítulo.',
    });
    expect(mocks.replaceManualChapters).not.toHaveBeenCalled();
  });

  it('PUT válido delega a replaceManualChapters e devolve lostLessonLinks', async () => {
    mocks.replaceManualChapters.mockResolvedValue({ source: 'MANUAL', chapters: [{ id: 'c1' }], lostLessonLinks: 2 });
    const res = await PUT(put({ chapters: [{ title: ' Cap 1 ', startPage: 3 }] }), props);
    expect(res.status).toBe(200);
    expect(mocks.replaceManualChapters).toHaveBeenCalledWith('m1', [{ title: 'Cap 1', startPage: 3 }]);
    expect(await res.json()).toEqual({ success: true, source: 'MANUAL', chapters: [{ id: 'c1' }], lostLessonLinks: 2 });
  });

  it('PUT propaga 400 de páginas decrescentes do service via apiError', async () => {
    const msg = 'As páginas iniciais devem ser crescentes e estar entre 1 e 300.';
    mocks.replaceManualChapters.mockRejectedValue(new DomainError(400, msg));
    const res = await PUT(put({ chapters: [{ title: 'A', startPage: 5 }, { title: 'B', startPage: 2 }] }), props);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: msg });
  });

  it('GET lista capítulos e POST extract devolve source e capítulos', async () => {
    mocks.listMaterialChapters.mockResolvedValue([{ id: 'c1' }]);
    const g = await GET(new Request('http://x'), props);
    expect(await g.json()).toEqual({ success: true, chapters: [{ id: 'c1' }] });
    mocks.reextractMaterialChapters.mockResolvedValue({ source: 'OUTLINE', chapters: [{ id: 'c1' }], lostLessonLinks: 0 });
    const res = await POST(new Request('http://x', { method: 'POST' }), props);
    expect(mocks.reextractMaterialChapters).toHaveBeenCalledWith('m1');
    expect(await res.json()).toEqual({ success: true, source: 'OUTLINE', chapters: [{ id: 'c1' }], lostLessonLinks: 0 });
  });

  it('aluno recebe 403', async () => {
    mocks.requireUser.mockRejectedValue(new AuthError(403, 'Acesso negado'));
    const res = await PUT(put({ chapters: [] }), props);
    expect(res.status).toBe(403);
    expect(mocks.replaceManualChapters).not.toHaveBeenCalled();
    const r2 = await POST(new Request('http://x', { method: 'POST' }), props);
    expect(r2.status).toBe(403);
  });
});
