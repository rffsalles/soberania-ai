import { describe, it, expect } from 'vitest';
import { indexChapters, normalizeSelection, checkState, toggleNode, visibleForQuery, ancestorsOf } from '../chapter-tree';
import { MAT_BOOK } from './chapter-tree-fixtures';

const idx = indexChapters(MAT_BOOK.chapters);
const state = (sel: string[], id: string) => checkState(id, new Set(sel), idx);

describe('chapter-tree', () => {
  it('indexChapters e ancestorsOf', () => {
    expect(idx.childrenOf.get(null)).toEqual(['u1', 'u2', 'u3']);
    expect(idx.childrenOf.get('s22')).toEqual(['s221', 's222']);
    expect(ancestorsOf('s221', idx)).toEqual(['s22', 'u2']);
  });
  it('normalizeSelection remove descendente de selecionado e ordena em pré-ordem', () => {
    expect(normalizeSelection(['s221', 'u3', 'u2', 's21'], idx)).toEqual(['u2', 'u3']);
  });
  it('normalizeSelection preserva ids desconhecidos no fim', () => {
    expect(normalizeSelection(['zz', 's221', 'u2'], idx)).toEqual(['u2', 'zz']);
  });
  it('marcar pai emite só o pai', () => {
    expect(toggleNode([], 'u2', idx)).toEqual(['u2']);
    expect(toggleNode(['s21', 's221'], 'u2', idx)).toEqual(['u2']);
  });
  it('desmarcar o próprio nó', () => {
    expect(toggleNode(['u2'], 'u2', idx)).toEqual([]);
    expect(toggleNode(['s21', 'u3'], 's21', idx)).toEqual(['u3']);
  });
  it('desmarcar descendente de pai marcado troca o pai pelos irmãos restantes', () => {
    expect(toggleNode(['u2'], 's221', idx)).toEqual(['s21', 's222']);
    expect(toggleNode(['u2'], 's22', idx)).toEqual(['s21']);
    expect(toggleNode(['s22', 'u3'], 's221', idx)).toEqual(['s222', 'u3']);
  });
  it('estado parcial e marcado por herança', () => {
    expect(state(['s221'], 'u2')).toBe('mixed');
    expect(state(['s221'], 's22')).toBe('mixed');
    expect(state(['s221'], 's222')).toBe('unchecked');
    expect(state(['u2'], 's221')).toBe('checked');
    expect(state(['s21', 's22'], 'u2')).toBe('mixed');
  });
  it('busca mantém ancestrais e ignora acento e caixa', () => {
    expect(visibleForQuery('FRACOES', idx)).toEqual(new Set(['u2', 's22', 's221', 's222']));
    expect(visibleForQuery('notáveis', idx)).toEqual(new Set(['u2', 's21']));
    expect(visibleForQuery('   ', idx)).toBeNull();
  });
});
