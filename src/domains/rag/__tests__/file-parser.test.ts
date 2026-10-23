import { describe, it, expect } from 'vitest';
import { SYNTHETIC_CHAPTER_PATTERN, SYNTHETIC_PAGE_CHARS_TEXT, validateFileSafety, parseDocumentFile } from '../file-parser';

describe('RAG Domain - File Parser & Safety Validator', () => {
  it('deve validar com sucesso arquivo de texto simples (.txt)', () => {
    const textBuffer = Buffer.from('Conteúdo didático sobre Estruturas de Dados e Algoritmos.');
    const result = validateFileSafety(textBuffer, 'algoritmos.txt');

    expect(result.isValid).toBe(true);
    expect(result.extension).toBe('txt');
    expect(result.sanitizedFilename).toBe('algoritmos.txt');
  });

  it('deve validar com sucesso arquivo markdown (.md)', () => {
    const mdBuffer = Buffer.from('# Título\n\nResumo da aula sobre grafos.');
    const result = validateFileSafety(mdBuffer, 'aula-grafos.md');

    expect(result.isValid).toBe(true);
    expect(result.extension).toBe('md');
    expect(result.sanitizedFilename).toBe('aula-grafos.md');
  });

  it('deve rejeitar arquivos com extensão não permitida (.exe, .sh, .py)', () => {
    const scriptBuffer = Buffer.from('#!/bin/bash\necho "test"');
    const result = validateFileSafety(scriptBuffer, 'malicious.sh');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('não permitida');
  });

  it('deve detectar assinatura mágica inválida para suposto arquivo PDF', () => {
    const fakePdf = Buffer.from('I am not a PDF file at all!');
    const result = validateFileSafety(fakePdf, 'apostila_falsa.pdf');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('cabeçalho inválida');
  });

  it('deve validar arquivo PDF com assinatura mágica correta (%PDF-)', () => {
    const validPdfHeader = Buffer.from('%PDF-1.7\n%Fake PDF content for test');
    const result = validateFileSafety(validPdfHeader, 'capitulo1.pdf');

    expect(result.isValid).toBe(true);
    expect(result.extension).toBe('pdf');
  });

  it('deve detectar assinatura mágica inválida para suposto arquivo DOCX', () => {
    const fakeDocx = Buffer.from('Plain text fake docx');
    const result = validateFileSafety(fakeDocx, 'documento.docx');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('pacote inválida');
  });

  it('deve validar arquivo DOCX com assinatura mágica correta (PK ZIP header)', () => {
    const validDocxHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('sample docx zip stream'),
    ]);
    const result = validateFileSafety(validDocxHeader, 'plano_ensino.docx');

    expect(result.isValid).toBe(true);
    expect(result.extension).toBe('docx');
  });

  it('deve parsear conteúdo de arquivo TXT e MD corretamente', async () => {
    const textContent = 'Paradigmas de Programação: Imperativo, Orientado a Objetos e Funcional.';
    const buffer = Buffer.from(textContent, 'utf-8');

    const parsed = await parseDocumentFile(buffer, 'documento.txt');

    expect(parsed.totalPages).toBe(1);
    expect(parsed.isOcrApplied).toBe(false);
    expect(parsed.detectedMimeType).toBe('text/plain');
    expect(parsed.pages[0].pageNumber).toBe(1);
    expect(parsed.pages[0].text).toBe(textContent);
  });

  it('rotula fatias de TXT/MD como trechos sintéticos, nunca como páginas', async () => {
    const parsed = await parseDocumentFile(Buffer.from('x'.repeat(SYNTHETIC_PAGE_CHARS_TEXT + 10)), 'notas.md');
    expect(parsed.totalPages).toBe(2);
    expect(parsed.pages.map((p) => p.chapter)).toEqual(['Trecho 1', 'Trecho 2']);
    expect(parsed.pages.every((p) => SYNTHETIC_CHAPTER_PATTERN.test(p.chapter ?? ''))).toBe(true);
  });

  it('arquivo de texto vazio devolve zero páginas em vez de indexar o nome do arquivo', async () => {
    const parsed = await parseDocumentFile(Buffer.from('   '), 'vazio.txt');
    expect(parsed.pages).toEqual([]);
    expect(parsed.totalPages).toBe(0);
  });
});
