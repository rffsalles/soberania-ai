import { describe, expect, it } from 'vitest';
import { MAT_BASICA_TOTAL_PAGES, matBasicaPages } from './fixtures/mat-basica';

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
});
