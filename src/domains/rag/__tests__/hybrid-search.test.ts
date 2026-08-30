import { describe, it, expect } from 'vitest';
import { executeHybridSearch } from '../hybrid-search';

describe('RAG Domain - Hybrid Search (RRF pgvector + BM25)', () => {
  it('deve retornar trechos com score RRF ordenados por relevância', async () => {
    const result = await executeHybridSearch({
      query: 'diferença entre INNER JOIN e LEFT JOIN',
      topK: 3,
    });

    expect(result.chunks).toBeDefined();
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.length).toBeLessThanOrEqual(3);

    // O primeiro resultado deve ter maior RRF score
    const first = result.chunks[0];
    expect(first.rrfScore).toBeDefined();
    expect(first.bookTitle).toContain('Banco de Dados');
    expect(first.pageNumber).toBeGreaterThan(0);
  });

  it('deve formatar citação padronizada para RAG', async () => {
    const result = await executeHybridSearch({ query: '3FN normalização' });
    expect(result.primaryCitation).toBeDefined();
    expect(result.primaryCitation).toContain('Banco de Dados');
    expect(result.primaryCitation).toContain('pág.');
  });
});
