import { describe, it, expect } from 'vitest';
import { chapterToComboboxItem, planChaptersToComboboxItems, formatChapterShortList } from '../chapter-combobox-item';

describe('chapter-combobox-item', () => {
  it('chapterToComboboxItem formata título, subtítulo e páginas', () =>
    expect(chapterToComboboxItem({ id: 'ch1', order: 3, number: '3', parentId: null, depth: 0, title: 'Modelo ER', startPage: 41, endPage: 67 }, { title: 'Sistemas de Banco de Dados', author: 'Elmasri' }))
      .toEqual({ id: 'ch1', title: '3 Modelo ER', subtitle: 'Sistemas de Banco de Dados (Elmasri)', badge: 'p. 41 a 67' }));
  it('badge só com página inicial quando não há endPage', () =>
    expect(chapterToComboboxItem({ id: 'c', order: 1, number: '1', parentId: null, depth: 0, title: 'T', startPage: 5, endPage: null }, { title: 'L', author: 'A' }).badge).toBe('p. 5'));
  it('planChaptersToComboboxItems achata os livros', () =>
    expect(planChaptersToComboboxItems([
      { materialId: 'm', title: 'L', author: 'A', kind: 'BASIC', chapters: [{ id: 'c1', order: 1, number: '1', parentId: null, depth: 0, title: 'T', startPage: 1, endPage: 2 }] },
      { materialId: 'n', title: 'V', author: 'B', kind: 'COMPLEMENTARY', chapters: [] },
    ]).map((i) => i.id)).toEqual(['c1']));
  it('chapterToComboboxItem usa number e recua por depth', () => {
    expect(chapterToComboboxItem({ id: 's221', order: 5, number: '2.2.1', title: 'Operações com frações', startPage: 51, endPage: 57, parentId: 's22', depth: 2 },
      { title: 'Matemática Básica', author: 'Silva' }))
      .toEqual({ id: 's221', title: '\u2003\u20032.2.1 Operações com frações', subtitle: 'Matemática Básica (Silva)', badge: 'p. 51 a 57' });
  });
  it('formatChapterShortList ordena por segmentos, deduplica e usa travessão quando vazio', () => {
    expect(formatChapterShortList(['2.3', '1', '2.10', '2.3'])).toBe('Cap. 1, 2.3, 2.10');
    expect(formatChapterShortList(['2.10', '2.9'])).toBe('Cap. 2.9, 2.10');
    expect(formatChapterShortList([])).toBe('—');
  });

  it('formatChapterShortList trata segmento não numérico como 0 (sem NaN no comparador)', () => {
    expect(formatChapterShortList(['2.1', '2.x', '1'])).toBe('Cap. 1, 2.x, 2.1');
  });
});
