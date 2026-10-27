import { describe, expect, it } from 'vitest';
import { materialChaptersSchema } from '../material-chapters.validator';
import { CHAPTER_TITLE_MAX, MAX_CHAPTER_NODES } from '@/domains/rag/constants';

const many = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `C${i + 1}`, startPage: i + 1 }));

describe('materialChaptersSchema', () => {
  it('raiz com mais de MAX_CHAPTER_NODES itens é barrada pelo .max do array', () => {
    const r = materialChaptersSchema.safeParse({ chapters: many(MAX_CHAPTER_NODES + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ code: 'too_big', path: ['chapters'] });
  });
  it('children com mais de MAX_CHAPTER_NODES itens é barrado pelo .max do array', () => {
    const r = materialChaptersSchema.safeParse({ chapters: [{ title: 'U', startPage: 1, children: many(MAX_CHAPTER_NODES + 1) }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ code: 'too_big', path: ['chapters', 0, 'children'] });
  });
  it('árvore dentro dos limites passa', () =>
    expect(materialChaptersSchema.safeParse({ chapters: [{ title: 'U', startPage: 1, children: many(3) }] }).success).toBe(true));
  it('título acima de CHAPTER_TITLE_MAX é barrado; no limite passa', () => {
    const at = (len: number) => materialChaptersSchema.safeParse({ chapters: [{ title: 'a'.repeat(len), startPage: 1 }] }).success;
    expect(at(CHAPTER_TITLE_MAX)).toBe(true);
    expect(at(CHAPTER_TITLE_MAX + 1)).toBe(false);
  });
});
