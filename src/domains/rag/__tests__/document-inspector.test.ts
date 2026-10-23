import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DocumentInspectorService,
  documentInspectorService,
  selectHeaderText,
  normalizeCategories,
} from '../document-inspector';
import { aiProvider } from '@/lib/ai-provider';
import * as fileParser from '../file-parser';
import type { RawDocumentPage } from '../types';

vi.mock('../file-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-parser')>();
  return { ...actual, parseDocumentFile: vi.fn(actual.parseDocumentFile) };
});

const CATALOG = ['Engenharia de Software', 'Banco de Dados', 'Metodologia Científica'];

function mockAiJson(payload: unknown) {
  return vi.spyOn(aiProvider, 'streamChat').mockImplementation(async function* () {
    yield { token: '```json\n', isComplete: false };
    yield { token: JSON.stringify(payload), isComplete: false };
    yield { token: '\n```', isComplete: true };
  });
}

describe('RAG Domain - DocumentInspectorService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.AI_PROVIDER = 'groq';
    process.env.AI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
  });

  it('deve extrair título, autor e categorias quando a IA retorna JSON válido', async () => {
    const sampleText = '# Engenharia de Software Moderna\nPor Marco Tulio Valente\n\nCapítulo 1: Introdução...';
    const buffer = Buffer.from(sampleText, 'utf-8');

    mockAiJson({
      title: 'Engenharia de Software Moderna',
      author: 'Marco Tulio Valente',
      categories: ['Engenharia de Software', 'Computação'],
      summary: 'Livro didático cobrindo princípios de engenharia de software.',
    });

    const result = await documentInspectorService.inspectDocumentHeader(buffer, 'engenharia_software.txt');

    expect(result.title).toBe('Engenharia de Software Moderna');
    expect(result.author).toBe('Marco Tulio Valente');
    expect(result.categories).toEqual(['Engenharia de Software', 'Computação']);
    expect(result.source).toBe('ai');
    expect(result.aiApplied).toBe(true);
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
    expect(result.categories).toEqual([]);
    expect(result.source).toBe('heuristic');
    expect(result.aiApplied).toBe(false);
  });

  it('heurística sem autor devolve author vazio, nunca um placeholder', async () => {
    vi.spyOn(aiProvider, 'streamChat').mockImplementation(async function* () {
      throw new Error('offline');
    });
    const buffer = Buffer.from('Introdução à Lógica\n\nCapítulo 1: Proposições e conectivos lógicos.', 'utf-8');
    const result = await new DocumentInspectorService().inspectDocumentHeader(buffer, 'logica.txt');
    expect(result.author).toBe('');
    expect(result.source).toBe('heuristic');
    expect(result.aiApplied).toBe(false);
  });

  it('IA que devolve título sem autor mantém author vazio e source ai', async () => {
    mockAiJson({ title: 'Cálculo I', author: '', categories: [], summary: 'x' });
    const result = await documentInspectorService.inspectDocumentHeader(
      Buffer.from('Cálculo I\nUniversidade\nSumário\n1. Limites', 'utf-8'),
      'calculo.txt'
    );
    expect(result.author).toBe('');
    expect(result.source).toBe('ai');
  });

  it('deve retornar metadados de fallback padrão se o arquivo for vazio', async () => {
    const emptyBuffer = Buffer.from('', 'utf-8');

    const inspector = new DocumentInspectorService();
    const result = await inspector.inspectDocumentHeader(emptyBuffer, 'documento_vazio.txt');

    expect(result.title).toBe('documento_vazio');
    expect(result.author).toBe('');
    expect(result.categories).toEqual([]);
    expect(result.source).toBe('filename');
    expect(result.aiApplied).toBe(false);
  });

  it('deve ignorar o stream de fallback do provedor e usar a heurística', async () => {
    const buffer = Buffer.from('Fernando Guerra\nMatemática Básica\nAutor: Fernando Guerra', 'utf-8');
    vi.spyOn(aiProvider, 'streamChat').mockImplementation(async function* () {
      yield { token: 'Muito bem colocado! ', isComplete: false, fallback: true };
      yield { token: '{"title": "nao deveria ser lido"}', isComplete: true, fallback: true };
    });

    const result = await documentInspectorService.inspectDocumentHeader(buffer, 'mat basica.pdf.txt');

    expect(result.aiApplied).toBe(false);
    expect(result.author).toBe('Fernando Guerra');
    expect(result.title).not.toBe('nao deveria ser lido');
  });

  it('não deve chamar a IA quando o provedor está em modo mock', async () => {
    process.env.AI_PROVIDER = 'mock';
    const spy = vi.spyOn(aiProvider, 'streamChat');
    const buffer = Buffer.from('Título Qualquer\nAutor: Alguém da Silva\nTexto do documento.', 'utf-8');

    const result = await documentInspectorService.inspectDocumentHeader(buffer, 'doc.txt');

    expect(spy).not.toHaveBeenCalled();
    expect(result.aiApplied).toBe(false);
    expect(result.author).toBe('Alguém da Silva');
  });

  it('deve aceitar "authors" em array e juntar os nomes', async () => {
    mockAiJson({ title: 'Obra Coletiva', authors: ['Ana Silva', 'Pedro Santos'], categories: [] });
    const buffer = Buffer.from('Obra Coletiva\nAna Silva, Pedro Santos\nIntrodução ao tema.', 'utf-8');

    const result = await documentInspectorService.inspectDocumentHeader(buffer, 'obra.txt');

    expect(result.author).toBe('Ana Silva, Pedro Santos');
  });

  it('deve oferecer as categorias cadastradas no prompt e devolver apenas as que existem', async () => {
    const spy = mockAiJson({
      title: 'Matemática Básica',
      author: 'Fernando Guerra',
      categories: ['banco de dados', 'Matemática'],
    });
    const buffer = Buffer.from('Matemática Básica\nFernando Guerra\nSumário...', 'utf-8');

    const result = await documentInspectorService.inspectDocumentHeader(buffer, 'mat.txt', {
      availableCategories: CATALOG,
    });

    const messages = spy.mock.calls[0][0];
    const fullPrompt = messages.map((m) => m.content).join('\n');
    expect(fullPrompt).toContain('Engenharia de Software');
    expect(fullPrompt).toContain('Metodologia Científica');
    expect(result.categories).toEqual(['Banco de Dados']);
    expect(result.suggestedCategory).toBe('Matemática');
  });

  it('deve preferir a sugestão explícita de nova categoria vinda da IA', async () => {
    mockAiJson({
      title: 'Cálculo I',
      author: 'Autor X',
      categories: [],
      suggestedCategory: 'Matemática',
    });
    const buffer = Buffer.from('Cálculo I\nAutor X\nLimites e derivadas.', 'utf-8');

    const result = await documentInspectorService.inspectDocumentHeader(buffer, 'calc.txt', {
      availableCategories: CATALOG,
    });

    expect(result.categories).toEqual([]);
    expect(result.suggestedCategory).toBe('Matemática');
  });

  it('deve incluir os metadados do PDF como dica no prompt e limitar o parse às primeiras páginas', async () => {
    const parseSpy = vi.mocked(fileParser.parseDocumentFile).mockResolvedValueOnce({
      totalPages: 300,
      pages: [{ pageNumber: 1, text: 'CAPA DO LIVRO\nEditora Tal' }],
      isOcrApplied: false,
      detectedMimeType: 'application/pdf',
      info: { title: 'Matemática Básica', author: 'Fernando Guerra' },
    });
    const spy = mockAiJson({ title: 'Matemática Básica', author: 'Fernando Guerra', categories: [] });

    await documentInspectorService.inspectDocumentHeader(Buffer.from('%PDF-1.4'), 'mat basica.pdf');

    expect(parseSpy).toHaveBeenCalledWith(expect.anything(), 'mat basica.pdf', expect.objectContaining({ maxPages: 8, skipOcr: true }));
    const userMessage = spy.mock.calls[0][0].find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Fernando Guerra');
    expect(userMessage).toContain('Matemática Básica');
  });
});

describe('heurística com ficha catalográfica', () => {
  it('extrai título e autores do padrão "Título / Autores. – Cidade" quando a IA não está disponível', async () => {
    process.env.AI_PROVIDER = 'mock';
    const ficha = [
      'Fernando Guerra',
      'Inder Jeet Taneja Volume 1',
      'Matemática Básica',
      'G934m \tGuerra, Fernando',
      'Matemática básica / Fernando Guerra e Inder Jeet Taneja. – Florianópolis : Departamento',
      'de Ciências da Administração / UFSC; [Brasília] : CAPES : UAB, 2009.',
      'ISBN: 978-85-61608-73-6',
    ].join('\n');

    const result = await documentInspectorService.inspectDocumentHeader(Buffer.from(ficha, 'utf-8'), 'mat basica.txt');

    expect(result.title).toBe('Matemática básica');
    expect(result.author).toBe('Fernando Guerra e Inder Jeet Taneja');
    expect(result.aiApplied).toBe(false);
    expect(result.source).toBe('catalog-entry');
  });
});

describe('selectHeaderText', () => {
  const page = (n: number, text: string): RawDocumentPage => ({ pageNumber: n, text });

  it('usa as 4 primeiras páginas e inclui a ficha catalográfica encontrada até a página 8', () => {
    const pages = [
      page(1, 'Capa'),
      page(2, 'Folha de rosto'),
      page(3, 'Dedicatória'),
      page(4, 'Sumário'),
      page(5, 'Prefácio'),
      page(6, 'Dados Internacionais de Catalogação na Publicação\nISBN 978-85-0000-000-0\nCDD 510'),
      page(7, 'Capítulo 1'),
      page(9, 'ISBN deveria ser ignorado aqui'),
    ];

    const text = selectHeaderText(pages);

    expect(text).toContain('Capa');
    expect(text).toContain('Sumário');
    expect(text).toContain('ISBN 978-85-0000-000-0');
    expect(text).not.toContain('Prefácio');
    expect(text).not.toContain('Capítulo 1');
    expect(text).not.toContain('ignorado');
  });

  it('respeita o orçamento por página e o teto total de caracteres', () => {
    const pages = Array.from({ length: 8 }, (_, i) => page(i + 1, `P${i + 1} ` + 'x'.repeat(5000)));

    const text = selectHeaderText(pages);

    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toContain('P1 ');
    expect(text).toContain('P4 ');
    expect(text.indexOf('P4 ')).toBeGreaterThan(text.indexOf('P3 '));
  });
});

describe('normalizeCategories', () => {
  it('casa ignorando caixa e acentos e devolve o nome cadastrado', () => {
    const result = normalizeCategories(['METODOLOGIA CIENTIFICA', 'banco de dados', 'Física'], CATALOG);
    expect(result.matched).toEqual(['Metodologia Científica', 'Banco de Dados']);
    expect(result.unmatched).toEqual(['Física']);
  });

  it('remove duplicatas', () => {
    const result = normalizeCategories(['Banco de Dados', 'banco de dados'], CATALOG);
    expect(result.matched).toEqual(['Banco de Dados']);
  });
});
