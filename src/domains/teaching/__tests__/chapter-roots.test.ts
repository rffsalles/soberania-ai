import { describe, it, expect } from 'vitest';
import { chapterParentIndex, rootBooks, rootIdOf, toRootIds } from '../chapter-roots';
import type { PlanChapterBook } from '../services/plan-chapters-service';

const ch = (id: string, order: number, title: string, startPage: number, endPage: number, parentId: string | null, depth: number, number: string) => ({
  id, order, title, startPage, endPage, parentId, depth, number,
});
const book: PlanChapterBook = {
  materialId: 'm1', title: 'Matemática Básica', author: 'Silva', kind: 'BASIC',
  chapters: [
    ch('u1', 1, 'Unidade 1', 15, 42, null, 0, '1'),
    ch('u2', 2, 'Unidade 2', 43, 66, null, 0, '2'),
    ch('s21', 3, 'Produtos notáveis', 43, 47, 'u2', 1, '2.1'),
    ch('s22', 4, 'Frações', 48, 66, 'u2', 1, '2.2'),
    ch('s221', 5, 'Operações com frações', 51, 57, 's22', 2, '2.2.1'),
    ch('s222', 6, 'Frações equivalentes', 58, 66, 's22', 2, '2.2.2'),
    ch('u3', 7, 'Unidade 3', 67, 94, null, 0, '3'),
  ],
};

describe('chapter-roots', () => {
  it('rootIdOf sobe até a raiz', () => {
    const idx = chapterParentIndex([book]);
    expect(rootIdOf('s221', idx)).toBe('u2');
    expect(rootIdOf('u3', idx)).toBe('u3');
    expect(rootIdOf('desconhecido', idx)).toBe('desconhecido');
  });
  it('toRootIds mapeia e deduplica na ordem', () => {
    expect(toRootIds(['s21', 's222', 'u1', 'u2'], chapterParentIndex([book]))).toEqual(['u2', 'u1']);
  });
  it('rootBooks mantém só depth 0', () => {
    expect(rootBooks([book])[0].chapters.map((c) => c.id)).toEqual(['u1', 'u2', 'u3']);
  });
  it('rootIdOf não entra em laço com ciclo', () => {
    const idx = new Map([
      ['a', { id: 'a', parentId: 'b' }],
      ['b', { id: 'b', parentId: 'a' }],
    ]);
    expect(['a', 'b']).toContain(rootIdOf('a', idx));
  });
});
