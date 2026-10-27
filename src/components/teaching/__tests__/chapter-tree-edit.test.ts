import { describe, it, expect } from 'vitest';
import * as t from '../chapter-tree-edit';

const n = (key: string, startPage: number, children: t.EditableChapter[] = [], title = key): t.EditableChapter =>
  ({ key, title, startPage: String(startPage), children });
const tree = () => [n('u1', 15), n('u2', 43, [n('s21', 43), n('s22', 48, [n('s221', 51)])]), n('u3', 67)];
const nums = (nodes: t.EditableChapter[]) => Object.fromEntries(t.numberEditable(nodes));

describe('chapter-tree-edit', () => {
  it('fromChapterDtos monta a árvore e toChapterPayload omite children vazio', () => {
    const dtos = [
      { id: 'u2', parentId: null, title: 'Unidade 2', startPage: 43 },
      { id: 's21', parentId: 'u2', title: ' Produtos notáveis ', startPage: 43 },
    ];
    expect(t.toChapterPayload(t.fromChapterDtos(dtos))).toEqual([
      { title: 'Unidade 2', startPage: 43, children: [{ title: 'Produtos notáveis', startPage: 43 }] },
    ]);
  });
  it('numera e deriva a página final', () => {
    expect(nums(tree())).toMatchObject({ u2: '2', s21: '2.1', s22: '2.2', s221: '2.2.1', u3: '3' });
    expect(Object.fromEntries(t.endPagesOf(tree(), 174))).toEqual({ u1: 42, u2: 66, s21: 47, s22: 66, s221: 66, u3: 174 });
  });
  it('indent vira último filho do irmão anterior levando os filhos', () => {
    expect(nums(t.indentNode(tree(), 's22'))).toMatchObject({ s21: '2.1', s22: '2.1.1', s221: '2.1.1.1', u3: '3' });
  });
  it('indent é no-op no primeiro irmão e além da profundidade 6', () => {
    const base = tree();
    expect(t.indentNode(base, 's21')).toBe(base);
    expect(t.canIndent(base, 's21')).toBe(false);
    let chain = n('d6', 7);
    for (let d = 5; d >= 0; d--) chain = n(`d${d}`, d + 1, [chain]);
    const deep = [chain, n('irmao', 50)];
    expect(t.addChild(deep, 'd6', n('d7', 8))).toBe(deep);
    // g tem altura 6; recuar o levaria a depth 1 + 6 = 7.
    const sib = [n('a', 1, [n('b', 2)]), n('g', 10, [n('h', 11, [n('i', 12, [n('j', 13, [n('k', 14, [n('l', 15, [n('m', 16)])])])])])])];
    expect(t.indentNode(sib, 'g')).toBe(sib);
    expect(t.canIndent(sib, 'g')).toBe(false);
  });
  it('outdent vira irmão do pai logo após ele; raiz é no-op', () => {
    const out = t.outdentNode(tree(), 's221');
    expect(nums(out)).toMatchObject({ s21: '2.1', s22: '2.2', s221: '2.3', u3: '3' });
    const base = tree();
    expect(t.outdentNode(base, 'u1')).toBe(base);
    expect(t.canOutdent(base, 'u1')).toBe(false);
  });
  it('move troca com o irmão e é no-op nas pontas', () => {
    expect(t.moveNode(tree(), 'u3', -1).map((x) => x.key)).toEqual(['u1', 'u3', 'u2']);
    const base = tree();
    expect(t.moveNode(base, 'u1', -1)).toBe(base);
  });
  it('remove a subárvore e conta descendentes', () => {
    expect(t.countDescendants(tree(), 'u2')).toBe(3);
    expect(nums(t.removeNode(tree(), 's22'))).toEqual({ u1: '1', u2: '2', s21: '2.1', u3: '3' });
  });
  it('adiciona irmão abaixo e filho no fim', () => {
    expect(nums(t.addSibling(tree(), 's21', n('novo', 45)))).toMatchObject({ novo: '2.2', s22: '2.3' });
    expect(nums(t.addChild(tree(), 's22', n('novo', 60)))).toMatchObject({ novo: '2.2.2' });
  });
  it('valida por nó com as invariantes', () => {
    const bad = [n('u1', 15), n('u2', 43, [n('s21', 40), n('s22', 40, [], '')]), n('u3', 0)];
    const v = t.validateEditable(bad, 174);
    expect(v.byKey.get('s21')).toBe('Começa antes do capítulo pai.');
    expect(v.byKey.get('s22')).toBe('Informe o título.');
    expect(v.byKey.get('u3')).toBe('A página deve estar entre 1 e 174.');
    expect(t.validateEditable(t.moveNode(tree(), 'u3', -1), 174).byKey.get('u2')).toBe('Não pode começar antes do capítulo anterior.');
    expect(t.validateEditable([n('u1', 15, [n('a', 21), n('b', 21)]), n('u2', 30)], 174).byKey.size).toBe(0); // irmãos na mesma página
    expect(t.validateEditable([n('u1', 15, [n('a', 20)]), n('u2', 18)], 174).byKey.get('a')).toBe('Começa depois do fim do capítulo pai.');
    expect(t.validateEditable(tree(), 174)).toEqual({ byKey: new Map(), global: null });
    const many = Array.from({ length: 501 }, (_, i) => n(`r${i}`, 1));
    expect(t.validateEditable(many, 174).global).toBe('Máximo de 500 capítulos por material.');
  });
  it('título acima de CHAPTER_TITLE_MAX caracteres é inválido (o servidor rejeitaria)', () => {
    const longo = 'a'.repeat(201);
    expect(t.validateEditable([n('u1', 1, [], longo)], 174).byKey.get('u1')).toBe('O título admite no máximo 200 caracteres.');
    expect(t.validateEditable([n('u1', 1, [], 'a'.repeat(200))], 174).byKey.size).toBe(0);
  });
});
