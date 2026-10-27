import { describe, expect, it } from 'vitest';
import { isValidChapterTree, outlineToTree, selectTocPages } from '../chapters';
import { MAT_BASICA_OUTLINE, MAT_BASICA_TOTAL_PAGES, matBasicaPages } from './fixtures/mat-basica';

describe('fixture mat basica', () => {
  const pages = matBasicaPages();
  it('tem 174 páginas, sumário completo e topo das demais', () => {
    expect(pages).toHaveLength(MAT_BASICA_TOTAL_PAGES);
    expect(pages[8].text).toContain('Conjuntos dos números naturais');
    expect(pages[9].text).toContain('Logaritmo natural');
    expect(pages[20].text.split('\n')).toEqual(['19Módulo 0', 'Unidade 1 – Conjuntos Numéricos', 'C ONJUNTO DOS NÚMEROS NATURAIS']);
    expect(pages[14].text.split('\n')[2]).toBe('UNIDADE 1');
    expect(pages.filter((p) => ![9, 10, 11].includes(p.pageNumber)).every((p) => p.text.split('\n').length <= 3)).toBe(true);
  });
  it('(d) páginas 9-11 entram como sumário mesmo com janela de 8 páginas', () => {
    expect(selectTocPages(matBasicaPages(), 8).map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it('(a) outline lixo do mat basica não gera árvore válida', () => {
    const tree = outlineToTree(MAT_BASICA_OUTLINE);
    expect(tree).toEqual([]);
    expect(isValidChapterTree(tree, MAT_BASICA_TOTAL_PAGES, 2)).toBe(false);
  });
});
