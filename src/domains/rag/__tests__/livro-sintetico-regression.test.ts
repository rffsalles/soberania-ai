import { describe, expect, it } from 'vitest';
import { alignDraftsToText, alignTreeToText, applyPageLabels, headingsToTree, isValidChapterTree, outlineToTree, selectTocPages } from '../chapters';
import { LIVRO_SINTETICO_OUTLINE, LIVRO_SINTETICO_PRINTED_TREE, LIVRO_SINTETICO_TOTAL_PAGES, livroSinteticoPages } from './fixtures/livro-sintetico';

describe('fixture livro sintetico', () => {
  const pages = livroSinteticoPages();
  it('tem 174 páginas, sumário completo e topo das demais', () => {
    expect(pages).toHaveLength(LIVRO_SINTETICO_TOTAL_PAGES);
    expect(pages[8].text).toContain('Operador lógico E');
    expect(pages[9].text).toContain('Classes de crescimento');
    expect(pages[20].text.split('\n')).toEqual(['19Módulo 0', 'Unidade 1 – Proposições Lógicas', 'O PERADOR LÓGICO E']);
    expect(pages[14].text.split('\n')[2]).toBe('UNIDADE 1');
    expect(pages.filter((p) => ![9, 10, 11].includes(p.pageNumber)).every((p) => p.text.split('\n').length <= 3)).toBe(true);
  });
  it('(d) páginas 9-11 entram como sumário mesmo com janela de 8 páginas', () => {
    expect(selectTocPages(livroSinteticoPages(), 8).map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it('(a) outline lixo do livro sintetico não gera árvore válida', () => {
    const tree = outlineToTree(LIVRO_SINTETICO_OUTLINE);
    expect(tree).toEqual([]);
    expect(isValidChapterTree(tree, LIVRO_SINTETICO_TOTAL_PAGES, 2)).toBe(false);
  });
  it('(b) HEADINGS no livro sintetico acha só as 5 raízes, sem filhos', () => {
    expect(headingsToTree(livroSinteticoPages())).toEqual([
      { title: 'Unidade 1 – Proposições Lógicas', startPage: 15, children: [] },
      { title: 'Unidade 2 – Álgebra Booleana e Circuitos', startPage: 43, children: [] },
      { title: 'Unidade 3 – Conjuntos, Relações e Funções', startPage: 67, children: [] },
      { title: 'Unidade 4 – Indução, Recursão e Complexidade', startPage: 95, children: [] },
      { title: 'Unidade 5 – Grafos e Árvores de 1º e 2º Níveis, Buscas de 1º Nível', startPage: 123, children: [] },
    ]);
  });
  it('(c) sumário impresso realinhado cai nas páginas físicas do livro', () => {
    const aligned = alignDraftsToText(LIVRO_SINTETICO_PRINTED_TREE, livroSinteticoPages());
    expect(aligned.map((r) => r.startPage)).toEqual([15, 43, 67, 95, 123]);
    const fundamentais = aligned[0].children[1];
    expect(fundamentais).toMatchObject({ title: 'Proposições lógicas fundamentais', startPage: 20 });
    expect(fundamentais.children.map((c) => c.startPage)).toEqual([21, 21, 22, 23, 24]);
    expect(aligned[2].children[3].children[0]).toMatchObject({ title: 'Função injetora', startPage: 84 });
    expect(isValidChapterTree(aligned, LIVRO_SINTETICO_TOTAL_PAGES, 2)).toBe(true); // naturais e inteiros na 21: irmãos iguais são válidos
  });
  it('(e) rótulos triviais não convertem e o realinhamento acha 30 de 41 nós', () => {
    const labels = Array.from({ length: LIVRO_SINTETICO_TOTAL_PAGES }, (_, i) => String(i + 1));
    expect(applyPageLabels(LIVRO_SINTETICO_PRINTED_TREE, labels).converted).toBe(false);
    const { found, total } = alignTreeToText(LIVRO_SINTETICO_PRINTED_TREE, livroSinteticoPages());
    expect([found, total]).toEqual([30, 41]);
  });
});
