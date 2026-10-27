import { describe, expect, it } from 'vitest';
import { CHAPTER_TOC_DETECTED_PAGE_CHARS, CHAPTER_TOC_PAGE_CHARS } from '@/domains/rag/constants';
import { buildChapterExtractionMessages, parseChapterExtraction } from '../chapter-extraction-prompt';

describe('buildChapterExtractionMessages', () => {
  it('marca página física e impressa e pede página impressa', () => {
    const [sys, user] = buildChapterExtractionMessages({ pages: [{ pageNumber: 7, label: 'v', text: 'Sumário' }], totalPages: 300 });
    expect(user.content).toContain('--- Página física 7 (impressa: v) ---');
    expect(user.content).toContain('Sumário');
    expect(sys.content).toContain('startPage a página IMPRESSA');
    expect(sys.content).toContain('"children"');
  });
  it('omite o parêntese sem rótulo e corta o texto no limite', () => {
    const text = 'x'.repeat(CHAPTER_TOC_PAGE_CHARS + 50);
    const [, user] = buildChapterExtractionMessages({ pages: [{ pageNumber: 3, text }], totalPages: 10 });
    expect(user.content).toContain('--- Página física 3 ---');
    expect(user.content).not.toContain('(impressa:');
    expect(user.content).toContain('x'.repeat(CHAPTER_TOC_PAGE_CHARS));
    expect(user.content).not.toContain('x'.repeat(CHAPTER_TOC_PAGE_CHARS + 1));
  });
  it('página de sumário vai inteira até o limite de sumário', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `Tópico ${i + 1} ${'.'.repeat(30)} ${i + 1}`);
    const text = `Sumário\n${lines.join('\n')}`;
    expect(text.length).toBeGreaterThan(CHAPTER_TOC_PAGE_CHARS);
    expect(text.length).toBeLessThan(CHAPTER_TOC_DETECTED_PAGE_CHARS);
    const [, user] = buildChapterExtractionMessages({ pages: [{ pageNumber: 10, text }], totalPages: 174 });
    expect(user.content).toContain('Tópico 60');
  });
});

describe('parseChapterExtraction', () => {
  it('aceita JSON com texto ao redor e startPage em string; rejeita sem chapters', () => {
    expect(parseChapterExtraction('ok {"chapters":[{"title":" Cap 1 ","startPage":"12"}]} fim')).toEqual([
      { title: 'Cap 1', startPage: 12, children: [] },
    ]);
    expect(parseChapterExtraction('nada')).toBeNull();
    expect(parseChapterExtraction('{"foo":1}')).toBeNull();
  });
  it('rejeita título vazio e página não inteira', () => {
    expect(parseChapterExtraction('{"chapters":[{"title":"  ","startPage":1}]}')).toBeNull();
    expect(parseChapterExtraction('{"chapters":[{"title":"a","startPage":1.5}]}')).toBeNull();
    expect(parseChapterExtraction('{"chapters":[{"title":"a"')).toBeNull();
  });
  it('parse recursivo com 3 níveis', () => {
    const raw = JSON.stringify({ chapters: [
      { title: 'Unidade 1', startPage: 15, children: [
        { title: 'Conjuntos numéricos fundamentais', startPage: '18', children: [{ title: 'Conjuntos dos números naturais', startPage: 19 }] },
      ] },
      { title: 'Unidade 2', startPage: 43 },
    ] });
    expect(parseChapterExtraction(raw)).toEqual([
      { title: 'Unidade 1', startPage: 15, children: [
        { title: 'Conjuntos numéricos fundamentais', startPage: 18, children: [{ title: 'Conjuntos dos números naturais', startPage: 19, children: [] }] },
      ] },
      { title: 'Unidade 2', startPage: 43, children: [] },
    ]);
  });
  it('children null vira []', () => {
    expect(parseChapterExtraction('{"chapters":[{"title":"A","startPage":3,"children":null},{"title":"B","startPage":9}]}')).toEqual([
      { title: 'A', startPage: 3, children: [] },
      { title: 'B', startPage: 9, children: [] },
    ]);
  });
  it('resposta truncada no meio do 3º nó devolve os 2 primeiros', () => {
    const raw = '```json\n{"chapters":[{"title":"A {x}","startPage":3,"children":[]},{"title":"B \\"q\\"","startPage":9,"children":[{"title":"b1","startPage":10,"children":[]}]},{"title":"C","startPa';
    expect(parseChapterExtraction(raw)).toEqual([
      { title: 'A {x}', startPage: 3, children: [] },
      { title: 'B "q"', startPage: 9, children: [{ title: 'b1', startPage: 10, children: [] }] },
    ]);
  });
  it('resposta truncada antes de qualquer nó completo devolve null', () => {
    expect(parseChapterExtraction('{"chapters":[{"title":"A","startPage":3,"children":[{"title":"a","sta')).toBeNull();
  });
  it('children ausente vira [] e filho inválido invalida tudo', () => {
    expect(parseChapterExtraction('{"chapters":[{"title":"A","startPage":3},{"title":"B","startPage":9}]}')).toEqual([
      { title: 'A', startPage: 3, children: [] },
      { title: 'B', startPage: 9, children: [] },
    ]);
    expect(parseChapterExtraction('{"chapters":[{"title":"A","startPage":3,"children":[{"title":" ","startPage":4}]}]}')).toBeNull();
  });
});
