import { describe, it, expect } from 'vitest';
import { chapterToComboboxItem, planChaptersToComboboxItems, formatChapterShortList } from '../chapter-combobox-item';

describe('chapter-combobox-item', () => {
  it('chapterToComboboxItem formata título, subtítulo e páginas', () =>
    expect(chapterToComboboxItem({ id: 'ch1', order: 3, title: 'Modelo ER', startPage: 41, endPage: 67 }, { title: 'Sistemas de Banco de Dados', author: 'Elmasri' }))
      .toEqual({ id: 'ch1', title: 'Cap. 3: Modelo ER', subtitle: 'Sistemas de Banco de Dados (Elmasri)', badge: 'p. 41 a 67' }));
  it('badge só com página inicial quando não há endPage', () =>
    expect(chapterToComboboxItem({ id: 'c', order: 1, title: 'T', startPage: 5, endPage: null }, { title: 'L', author: 'A' }).badge).toBe('p. 5'));
  it('planChaptersToComboboxItems achata os livros', () =>
    expect(planChaptersToComboboxItems([
      { materialId: 'm', title: 'L', author: 'A', kind: 'BASIC', chapters: [{ id: 'c1', order: 1, title: 'T', startPage: 1, endPage: 2 }] },
      { materialId: 'n', title: 'V', author: 'B', kind: 'COMPLEMENTARY', chapters: [] },
    ]).map((i) => i.id)).toEqual(['c1']));
  it('formatChapterShortList ordena, deduplica e usa travessão quando vazio', () => {
    expect(formatChapterShortList([4, 3, 3])).toBe('Cap. 3, 4');
    expect(formatChapterShortList([])).toBe('—');
  });
});
