import { describe, expect, it } from 'vitest';
import { CHAPTER_TOC_PAGE_CHARS } from '@/domains/rag/constants';
import { buildChapterExtractionMessages, parseChapterExtraction } from '../chapter-extraction-prompt';

describe('buildChapterExtractionMessages', () => {
  it('marca página física e impressa e pede página física', () => {
    const [sys, user] = buildChapterExtractionMessages({ pages: [{ pageNumber: 7, label: 'v', text: 'Sumário' }], totalPages: 300 });
    expect(user.content).toContain('--- Página física 7 (impressa: v) ---');
    expect(user.content).toContain('Sumário');
    expect(sys.content).toContain('página física');
  });
  it('omite o parêntese sem rótulo e corta o texto no limite', () => {
    const text = 'x'.repeat(CHAPTER_TOC_PAGE_CHARS + 50);
    const [, user] = buildChapterExtractionMessages({ pages: [{ pageNumber: 3, text }], totalPages: 10 });
    expect(user.content).toContain('--- Página física 3 ---');
    expect(user.content).not.toContain('impressa');
    expect(user.content).toContain('x'.repeat(CHAPTER_TOC_PAGE_CHARS));
    expect(user.content).not.toContain('x'.repeat(CHAPTER_TOC_PAGE_CHARS + 1));
  });
});

describe('parseChapterExtraction', () => {
  it('aceita JSON com texto ao redor e startPage em string; rejeita sem chapters', () => {
    expect(parseChapterExtraction('ok {"chapters":[{"title":" Cap 1 ","startPage":"12"}]} fim')).toEqual([
      { title: 'Cap 1', startPage: 12 },
    ]);
    expect(parseChapterExtraction('nada')).toBeNull();
    expect(parseChapterExtraction('{"foo":1}')).toBeNull();
  });
  it('rejeita título vazio e página não inteira', () => {
    expect(parseChapterExtraction('{"chapters":[{"title":"  ","startPage":1}]}')).toBeNull();
    expect(parseChapterExtraction('{"chapters":[{"title":"a","startPage":1.5}]}')).toBeNull();
    expect(parseChapterExtraction('{"chapters":[{"title":"a"')).toBeNull();
  });
});
