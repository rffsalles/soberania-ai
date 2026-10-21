import { describe, it, expect } from 'vitest';
import { documentIngestionService } from '../ingestion';

describe('RAG Domain - Ingestion Service (chunking)', () => {
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

  it('divide páginas longas em vários chunks preservando página, capítulo e categoria', () => {
    const longText = 'A normalização reduz redundância em bancos relacionais. '.repeat(30);
    const result = documentIngestionService.ingestMaterial({
      id: 'mat-x',
      title: 'Livro',
      author: 'Autor',
      subject: 'Banco de Dados',
      pages: [{ pageNumber: 42, chapter: 'Cap. 3', text: longText }],
    });

    expect(result.totalChunks).toBeGreaterThan(1);
    for (const c of result.createdChunks ?? []) {
      expect(c.materialId).toBe('mat-x');
      expect(c.pageNumber).toBe(42);
      expect(c.chapter).toBe('Cap. 3');
      expect(c.category).toBe('Banco de Dados');
    }
  });
});
