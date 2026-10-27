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

const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const LINKS_CONFLICT_MESSAGE = 'Esta alteração desfaz vínculos de aulas de outros professores.';
const conflictItem = { disciplina: 'BD', turma: 'A', classNumber: 4, topicTitle: 'Joins', professor: 'Ana' };

describe('rotas de capítulos do material', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacher);
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
    expect(mocks.replaceManualChapters).toHaveBeenCalledWith('m1', [{ title: 'Cap 1', startPage: 3, children: [] }], {
      user: teacher,
      force: false,
    });
    expect(await res.json()).toEqual({ success: true, source: 'MANUAL', chapters: [{ id: 'c1' }], lostLessonLinks: 2 });
  });

  it('payload recursivo chega ao service com filhos', async () => {
    mocks.replaceManualChapters.mockResolvedValue({ source: 'MANUAL', chapters: [], lostLessonLinks: 0 });
    const res = await PUT(put({ chapters: [{ title: 'U1', startPage: 2, children: [{ title: 'Frações', startPage: 3 }] }] }), props);
    expect(res.status).toBe(200);
    expect(mocks.replaceManualChapters).toHaveBeenCalledWith(
      'm1',
      [{ title: 'U1', startPage: 2, children: [{ title: 'Frações', startPage: 3, children: [] }] }],
      { user: teacher, force: false },
    );
  });

  it('payload plano antigo vira nós sem filhos', async () => {
    mocks.replaceManualChapters.mockResolvedValue({ source: 'MANUAL', chapters: [], lostLessonLinks: 0 });
    const res = await PUT(put({ chapters: [{ title: 'A', startPage: 1 }, { title: 'B', startPage: 5 }] }), props);
    expect(res.status).toBe(200);
    expect(mocks.replaceManualChapters).toHaveBeenCalledWith(
      'm1',
      [{ title: 'A', startPage: 1, children: [] }, { title: 'B', startPage: 5, children: [] }],
      { user: teacher, force: false },
    );
  });

  it('201 raízes passam', async () => {
    mocks.replaceManualChapters.mockResolvedValue({ source: 'MANUAL', chapters: [], lostLessonLinks: 0 });
    const chapters = Array.from({ length: 201 }, (_, i) => ({ title: `Cap ${i + 1}`, startPage: i + 1 }));
    const res = await PUT(put({ chapters }), props);
    expect(res.status).toBe(200);
    expect(mocks.replaceManualChapters).toHaveBeenCalledTimes(1);
  });

  it('501 nós dá 400 sem chamar o service', async () => {
    const children = Array.from({ length: 500 }, (_, i) => ({ title: `F ${i}`, startPage: 2 }));
    const res = await PUT(put({ chapters: [{ title: 'Raiz', startPage: 1, children }] }), props);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Capítulos inválidos: informe título e página inicial de cada capítulo.',
    });
    expect(mocks.replaceManualChapters).not.toHaveBeenCalled();
  });

  it('8 níveis (depth 7) dá 400 e 7 níveis passa', async () => {
    const nest = (levels: number): { title: string; startPage: number; children: unknown[] } => ({
      title: `N${levels}`,
      startPage: 1,
      children: levels > 1 ? [nest(levels - 1)] : [],
    });
    const bad = await PUT(put({ chapters: [nest(8)] }), props);
    expect(bad.status).toBe(400);
    expect(mocks.replaceManualChapters).not.toHaveBeenCalled();
    mocks.replaceManualChapters.mockResolvedValue({ source: 'MANUAL', chapters: [], lostLessonLinks: 0 });
    const ok = await PUT(put({ chapters: [nest(7)] }), props);
    expect(ok.status).toBe(200);
  });

  it('PUT propaga 400 de páginas decrescentes do service via apiError', async () => {
    const msg = 'Capítulo 2: a página inicial (3) não pode ser anterior à do item anterior (9).';
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
    expect(mocks.reextractMaterialChapters).toHaveBeenCalledWith('m1', { user: teacher, force: false });
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

  it('PUT e POST com ?force=1 repassam force: true', async () => {
    mocks.replaceManualChapters.mockResolvedValue({ source: 'MANUAL', chapters: [], lostLessonLinks: 0 });
    mocks.reextractMaterialChapters.mockResolvedValue({ source: 'OUTLINE', chapters: [], lostLessonLinks: 0 });
    const url = 'http://x/api/v1/library/materials/m1/chapters?force=1';
    await PUT(
      new Request(url, { method: 'PUT', body: JSON.stringify({ chapters: [{ title: 'Cap 1', startPage: 3 }] }) }),
      props,
    );
    expect(mocks.replaceManualChapters).toHaveBeenCalledWith('m1', [{ title: 'Cap 1', startPage: 3, children: [] }], {
      user: teacher,
      force: true,
    });
    await POST(new Request(`${url}`, { method: 'POST' }), props);
    expect(mocks.reextractMaterialChapters).toHaveBeenCalledWith('m1', { user: teacher, force: true });
  });

  it('409 do service devolve details no corpo', async () => {
    mocks.replaceManualChapters.mockRejectedValue(new DomainError(409, LINKS_CONFLICT_MESSAGE, [conflictItem]));
    const res = await PUT(put({ chapters: [{ title: 'A', startPage: 1 }] }), props);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: LINKS_CONFLICT_MESSAGE, details: [conflictItem] });
  });
});
