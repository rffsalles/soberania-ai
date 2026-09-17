import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentInspectorService, documentInspectorService } from '../document-inspector';
import { aiProvider } from '@/lib/ai-provider';

describe('RAG Domain - DocumentInspectorService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deve extrair título, autor e categorias quando a IA retorna JSON válido', async () => {
    const sampleText = '# Engenharia de Software Moderna\nPor Marco Tulio Valente\n\nCapítulo 1: Introdução...';
    const buffer = Buffer.from(sampleText, 'utf-8');

    const mockAiResponse = JSON.stringify({
      title: 'Engenharia de Software Moderna',
      author: 'Marco Tulio Valente',
      categories: ['Engenharia de Software', 'Computação'],
      summary: 'Livro didático cobrindo princípios de engenharia de software.',
    });

    vi.spyOn(aiProvider, 'streamChat').mockImplementation(async function* () {
      yield { token: '```json\n', isComplete: false };
      yield { token: mockAiResponse, isComplete: false };
      yield { token: '\n```', isComplete: true };
    });

    const result = await documentInspectorService.inspectDocumentHeader(buffer, 'engenharia_software.txt');

    expect(result.title).toBe('Engenharia de Software Moderna');
    expect(result.author).toBe('Marco Tulio Valente');
    expect(result.categories).toEqual(['Engenharia de Software', 'Computação']);
    expect(result.confidence).toBe(0.95);
  });

  it('deve usar extração heurística como fallback caso a IA falhe ou não responda', async () => {
    const textWithAuthorHeader = 'Inteligência Artificial na Educação\nAutor: Prof. Dr. Carlos Santos\nResumo sobre aplicação de SLM.';
    const buffer = Buffer.from(textWithAuthorHeader, 'utf-8');

    vi.spyOn(aiProvider, 'streamChat').mockImplementation(async function* () {
      throw new Error('Serviço de IA indisponível offline');
    });

    const inspector = new DocumentInspectorService();
    const result = await inspector.inspectDocumentHeader(buffer, 'ia_educacao.txt');

    expect(result.title).toBe('Inteligência Artificial na Educação');
    expect(result.author).toBe('Prof. Dr. Carlos Santos');
    expect(result.categories).toEqual(['Geral']);
    expect(result.confidence).toBe(0.7);
  });

  it('deve retornar metadados de fallback padrão se o arquivo for vazio', async () => {
    const emptyBuffer = Buffer.from('', 'utf-8');

    const inspector = new DocumentInspectorService();
    const result = await inspector.inspectDocumentHeader(emptyBuffer, 'documento_vazio.txt');

    expect(result.title).toBe('documento_vazio');
    expect(result.author).toBe('');
    expect(result.categories).toEqual(['Geral']);
    expect(result.confidence).toBe(0.3);
  });
});
