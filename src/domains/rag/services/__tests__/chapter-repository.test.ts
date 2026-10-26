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
vi.mock('@/lib/db', () => ({ db: { $transaction: (fn: never, o: never) => $transaction(fn, o) } }));

import { replaceChapters } from '../chapter-repository';

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
});
