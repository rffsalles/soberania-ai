import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chunkAssignmentsFromRows, toChapterRows, type ChapterNode } from '../../chapters';

const tx = {
  materialChapter: {
    deleteMany: vi.fn().mockResolvedValue({}),
    createManyAndReturn: vi.fn(async ({ data }: { data: { order: number }[] }) => data.map((d) => ({ id: `id${d.order}`, order: d.order }))),
    findMany: vi.fn().mockResolvedValue([]),
  },
  lessonPlanChapter: { createMany: vi.fn().mockResolvedValue({}) },
  $executeRaw: vi.fn().mockResolvedValue(0),
};
const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown, _opts?: unknown) => fn(tx));
const lessonPlanChapterFindMany = vi.fn();
const dbFindMany = vi.fn();
const queryRaw = vi.fn();
const userFindMany = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    $transaction: (fn: never, o: never) => $transaction(fn, o),
    $queryRaw: (...a: never[]) => queryRaw(...a),
    materialChapter: { findMany: (a: never) => dbFindMany(a) },
    lessonPlanChapter: { findMany: (a: never) => lessonPlanChapterFindMany(a) },
    user: { findMany: (a: never) => userFindMany(a) },
  },
}));

import { chapterNumbersFor, listChapterLinkDetails, listChapters, listDescendantIds, replaceChapters } from '../chapter-repository';

const node = (title: string, startPage: number, ...children: ChapterNode[]): ChapterNode => ({ title, startPage, children });
const tree3: ChapterNode[] = [
  { title: 'A', startPage: 3, children: [
    { title: 'A1', startPage: 3, children: [{ title: 'A1a', startPage: 4, children: [] }] },
    { title: 'A2', startPage: 7, children: [] },
  ] },
  { title: 'B', startPage: 10, children: [] },
];
const rows = toChapterRows([node('U1', 5, node('1.1', 5), node('1.2', 8)), node('U2', 12)], 20);

beforeEach(() => vi.clearAllMocks());

describe('replaceChapters', () => {
  it('insere nível a nível resolvendo parentId pelo parentOrder', async () => {
    await replaceChapters('m1', toChapterRows(tree3, 15), 'MANUAL' as never, [{ order: 3, lessonPlanId: 'l1' }], []);
    const levels = tx.materialChapter.createManyAndReturn.mock.calls.map(([a]) => a.data.map((d: any) => [d.order, d.depth, d.parentId]));
    expect(levels).toEqual([[[1, 0, null], [5, 0, null]], [[2, 1, 'id1'], [4, 1, 'id1']], [[3, 2, 'id2']]]);
    expect(tx.lessonPlanChapter.createMany).toHaveBeenCalledWith({ data: [{ lessonPlanId: 'l1', chapterId: 'id3' }], skipDuplicates: true });
  });
  it('parentOrder sem pai aborta antes dos vínculos', async () => {
    const orphan = [{ title: 'x', order: 1, depth: 1, parentOrder: 9, startPage: 1, endPage: 5 }];
    await expect(replaceChapters('m1', orphan, 'MANUAL' as never, [{ order: 1, lessonPlanId: 'l1' }], [])).rejects.toThrow('sem pai gravado');
    expect(tx.lessonPlanChapter.createMany).not.toHaveBeenCalled();
  });
  it('aplica o trecho nulo antes das faixas dos nós', async () => {
    await replaceChapters('m1', rows, 'MANUAL' as never, [], chunkAssignmentsFromRows(rows, 20));
    expect(tx.$executeRaw.mock.calls.map((c: any[]) => c[1])).toEqual([null, 'id2', 'id3', 'id4']);
  });
  it('listChapters deriva number', async () => {
    dbFindMany.mockResolvedValue([
      { id: 'u', order: 1, title: 'U1', startPage: 1, endPage: 9, source: 'MANUAL', parentId: null, depth: 0 },
      { id: 'f', order: 2, title: 'Frações', startPage: 2, endPage: 9, source: 'MANUAL', parentId: 'u', depth: 1 },
    ]);
    expect((await listChapters('m1')).map((c) => c.number)).toEqual(['1', '1.1']);
  });
  it('listDescendantIds vazio não consulta o banco', async () => {
    expect(await listDescendantIds([])).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it('listDescendantIds usa CTE recursiva', async () => {
    queryRaw.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    expect(await listDescendantIds(['c1'])).toEqual(['c1', 'c2']);
    const sql = (queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).toContain('"parentId"');
  });

  it('usa timeout de 60 s, cria capítulos em lote e só reescreve chunks alterados', async () => {
    await replaceChapters(
      'm1',
      [{ order: 1, title: 'Intro', depth: 0, parentOrder: null, startPage: 1, endPage: 10 }],
      'AUTO' as never,
      [],
      [{ order: 1, title: 'Intro', fromPage: 1, toPage: 10 }],
    );
    expect($transaction.mock.calls[0][1]).toEqual({ timeout: 60000, maxWait: 10000 });
    expect(tx.materialChapter.createManyAndReturn).toHaveBeenCalledTimes(1);
    const sql = (tx.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('IS DISTINCT FROM');
  });

  it('chama beforeWrite com o tx antes do deleteMany', async () => {
    vi.clearAllMocks();
    const order: string[] = [];
    tx.materialChapter.deleteMany.mockImplementationOnce(async () => { order.push('delete'); return {}; });
    const beforeWrite = vi.fn(async () => { order.push('before'); });
    await replaceChapters('m1', [{ order: 1, title: 'Intro', depth: 0, parentOrder: null, startPage: 1, endPage: 10 }], 'AUTO' as never, [], [], beforeWrite);
    expect(beforeWrite).toHaveBeenCalledWith(tx);
    expect(order).toEqual(['before', 'delete']);
  });

  it('se beforeWrite lança, nada é gravado', async () => {
    vi.clearAllMocks();
    const beforeWrite = vi.fn().mockRejectedValue(new Error('conflito'));
    await expect(
      replaceChapters('m1', [{ order: 1, title: 'Intro', depth: 0, parentOrder: null, startPage: 1, endPage: 10 }], 'AUTO' as never, [], [], beforeWrite),
    ).rejects.toThrow('conflito');
    expect(tx.materialChapter.deleteMany).not.toHaveBeenCalled();
    expect(tx.materialChapter.createManyAndReturn).not.toHaveBeenCalled();
  });
});

describe('listChapterLinkDetails', () => {
  it('listChapterLinkDetails deduplica por aula e resolve o nome do professor', async () => {
    const plan = (id: string, teacherId: string, classNumber: number, topicTitle: string) => ({
      lessonPlan: {
        id,
        classNumber,
        topicTitle,
        courseSchedule: {
          teachingPlan: { teacherId, subject: { discipline: { name: 'BD' }, class: { name: 'A' } } },
        },
      },
    });
    lessonPlanChapterFindMany.mockResolvedValue([
      plan('l1', 't1', 2, 'Modelagem'),
      plan('l1', 't1', 2, 'Modelagem'),
      plan('l9', 't2', 4, 'Joins'),
    ]);
    userFindMany.mockResolvedValue([{ id: 't2', name: 'Ana' }]);
    const r = await listChapterLinkDetails('m1');
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.lessonPlanId === 'l9')).toMatchObject({ teacherId: 't2', professor: 'Ana', disciplina: 'BD', turma: 'A', classNumber: 4, topicTitle: 'Joins' });
    expect(r.find((x) => x.lessonPlanId === 'l1')?.professor).toBe('—');
  });
});

describe('chapterNumbersFor', () => {
  it('lista vazia não consulta o banco', async () => {
    expect((await chapterNumbersFor([])).size).toBe(0);
    expect(dbFindMany).not.toHaveBeenCalled();
  });
  it('numera cada material separadamente', async () => {
    dbFindMany.mockResolvedValueOnce([
      { id: 'u1', order: 1, parentId: null, materialId: 'm1' }, { id: 'u2', order: 2, parentId: null, materialId: 'm1' },
      { id: 's21', order: 3, parentId: 'u2', materialId: 'm1' }, { id: 's22', order: 4, parentId: 'u2', materialId: 'm1' },
      { id: 'x1', order: 1, parentId: null, materialId: 'm2' }, { id: 'x2', order: 2, parentId: 'x1', materialId: 'm2' },
    ]);
    const map = await chapterNumbersFor(['s22', 'x2']);
    expect(map.get('s22')).toBe('2.2');
    expect(map.get('x2')).toBe('1.1');
    expect(dbFindMany).toHaveBeenCalledTimes(1);
    expect(dbFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { material: { chapters: { some: { id: { in: ['s22', 'x2'] } } } } },
      orderBy: [{ materialId: 'asc' }, { order: 'asc' }],
    }));
  });
});
