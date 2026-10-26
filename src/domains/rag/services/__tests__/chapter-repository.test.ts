import { describe, expect, it, vi } from 'vitest';

const tx = {
  materialChapter: {
    deleteMany: vi.fn().mockResolvedValue({}),
    createManyAndReturn: vi.fn().mockResolvedValue([{ id: 'c1', order: 1 }]),
    findMany: vi.fn().mockResolvedValue([]),
  },
  lessonPlanChapter: { createMany: vi.fn().mockResolvedValue({}) },
  $executeRaw: vi.fn().mockResolvedValue(0),
};
const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown, _opts?: unknown) => fn(tx));
const lessonPlanChapterFindMany = vi.fn();
const userFindMany = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    $transaction: (fn: never, o: never) => $transaction(fn, o),
    lessonPlanChapter: { findMany: (a: never) => lessonPlanChapterFindMany(a) },
    user: { findMany: (a: never) => userFindMany(a) },
  },
}));

import { listChapterLinkDetails, replaceChapters } from '../chapter-repository';

describe('replaceChapters', () => {
  it('usa timeout de 60 s, cria capítulos em lote e só reescreve chunks alterados', async () => {
    await replaceChapters(
      'm1',
      [{ order: 1, title: 'Intro', startPage: 1, endPage: 10 }],
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
    await replaceChapters('m1', [{ order: 1, title: 'Intro', startPage: 1, endPage: 10 }], 'AUTO' as never, [], [], beforeWrite);
    expect(beforeWrite).toHaveBeenCalledWith(tx);
    expect(order).toEqual(['before', 'delete']);
  });

  it('se beforeWrite lança, nada é gravado', async () => {
    vi.clearAllMocks();
    const beforeWrite = vi.fn().mockRejectedValue(new Error('conflito'));
    await expect(
      replaceChapters('m1', [{ order: 1, title: 'Intro', startPage: 1, endPage: 10 }], 'AUTO' as never, [], [], beforeWrite),
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
