import { describe, it, expect, vi } from 'vitest';
import { expandChapterScope, formatChapterLabel } from '../chapter-scope';

const book = { title: 'Matemática Básica', author: 'Silva' };

describe('chapter-scope', () => {
  it('expande escolhidos + descendentes', async () => {
    const listDescendantIds = vi.fn(async () => ['s22', 's221', 's222']);
    expect(await expandChapterScope(['s22'], { listDescendantIds })).toEqual(['s22', 's221', 's222']);
    expect(listDescendantIds).toHaveBeenCalledWith(['s22']);
  });
  it('expansão vazia volta aos escolhidos', async () => {
    expect(await expandChapterScope(['s22'], { listDescendantIds: async () => [] })).toEqual(['s22']);
  });
  it('rótulo com e sem endPage', () => {
    const c = { number: '2.2', title: 'Frações', book, startPage: 48 };
    expect(formatChapterLabel({ ...c, endPage: 66 })).toBe('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66');
    expect(formatChapterLabel({ ...c, endPage: null })).toBe('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48');
  });
});
