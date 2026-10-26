import { describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@/lib/db', () => ({ db: { materialChunk: { findMany: (a: unknown) => findMany(a) } } }));

import { sampleChunksByChapter } from '../chunk-repository';

describe('sampleChunksByChapter', () => {
  it('amostra por capítulo respeita perChapter, ordem dos capítulos e max', async () => {
    let call = 0;
    findMany.mockImplementation(async () => {
      call += 1;
      return [1, 2].map((n) => ({
        id: `c${call}-${n}`, materialId: 'm1', chapter: `Cap. ${call}`, section: null, pageNumber: n,
        content: 'Texto.', material: { title: 'Livro', author: 'Autor', subject: null },
      }));
    });
    const r = await sampleChunksByChapter(['ch1', 'ch2', 'ch3'], 2, 5);
    expect(findMany).toHaveBeenCalledTimes(3);
    ['ch1', 'ch2', 'ch3'].forEach((id, i) => {
      expect(findMany.mock.calls[i][0]).toMatchObject({ where: { chapterId: id }, take: 2 });
    });
    expect(r).toHaveLength(5);
    expect(r.map((c) => c.id)).toEqual(['c1-1', 'c1-2', 'c2-1', 'c2-2', 'c3-1']);
    expect(r[0]).toEqual({
      id: 'c1-1', materialId: 'm1', bookTitle: 'Livro', author: 'Autor', chapter: 'Cap. 1',
      section: undefined, pageNumber: 1, content: 'Texto.', category: undefined,
    });
  });
});
