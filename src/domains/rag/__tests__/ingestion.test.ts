import { describe, it, expect } from 'vitest';
import { documentIngestionService } from '../ingestion';
import { executeHybridSearch } from '../hybrid-search';

describe('RAG Domain - Ingestion Service', () => {
  it('deve realizar chunking semântico com overlap de artigo científico', () => {
    const result = documentIngestionService.ingestMaterial({
      title: 'Artigo: Impacto Pedagógico de SLMs no Ensino Técnico',
      author: 'Vasconcelos & Salles (2026)',
      subject: 'Inteligência Artificial Educacional',
      materialType: 'SCIENTIFIC_PAPER',
      pages: [
        {
          pageNumber: 1,
          chapter: 'Introdução & Metodologia',
          section: '1.1 Hipótese',
          text: 'Este estudo avalia a acurácia de Small Language Models com 3B de parâmetros na tutoria ativa de banco de dados. O método socrático revelou-se eficaz na prevenção de dependência cognitiva e na promoção da retenção de longo prazo.',
        },
      ],
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.totalChunks).toBeGreaterThan(0);
    expect(result.materialId).toBeDefined();
  });

  it('deve permitir busca imediata no RAG Híbrido após ingestão', async () => {
    const uniqueKeyword = 'algoritmos_quantizados_xyz';
    documentIngestionService.ingestMaterial({
      title: 'Artigo Especializado em Algoritmos',
      author: 'Pesquisador Demo',
      subject: 'Computação Avançada',
      pages: [
        {
          pageNumber: 42,
          chapter: 'Seção de Teste',
          text: `O método ${uniqueKeyword} otimiza o uso de memória no appliance educacional permitindo 200 sessões concorrentes sem perda de acurácia conceitual.`,
        },
      ],
    });

    const searchResult = await executeHybridSearch({
      query: uniqueKeyword,
      topK: 1,
    });

    expect(searchResult.chunks.length).toBeGreaterThan(0);
    expect(searchResult.chunks[0].content).toContain(uniqueKeyword);
    expect(searchResult.primaryCitation).toContain('pág. 42');
  });

  it('deve associar categoria corretamente ao chunk ingerido', async () => {
    const categoryName = 'Diretrizes Curriculares Nacionais (DCN / MEC)';
    documentIngestionService.ingestMaterial({
      title: 'Guia de Diretrizes Pedagógicas',
      author: 'Comissão Especial MEC',
      subject: categoryName,
      pages: [
        {
          pageNumber: 5,
          text: 'As diretrizes curriculares orientam a articulação entre teoria e prática profissional no ensino superior.',
        },
      ],
    });

    const searchResult = await executeHybridSearch({
      query: 'articulação entre teoria e prática',
      topK: 1,
    });

    expect(searchResult.chunks[0].category).toBe(categoryName);
  });
});

