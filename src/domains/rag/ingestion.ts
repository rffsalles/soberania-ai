import type { DidacticChunk, MaterialIngestionInput, IngestionResult } from './types';
import { addChunksToCorpus } from './hybrid-search';

export interface ChunkingOptions {
  maxChunkCharacters?: number;
  overlapCharacters?: number;
}

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  maxChunkCharacters: 450,
  overlapCharacters: 60,
};

/**
 * Serviço de Ingestão de Bibliografia Didática e Artigos Científicos
 * Realiza parser de páginas, chunking semântico com overlap e indexação estruturada
 */
export class DocumentIngestionService {
  /**
   * Processa documento composto por páginas estruturadas
   */
  public ingestMaterial(
    input: MaterialIngestionInput,
    options: ChunkingOptions = {}
  ): IngestionResult {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const materialId = `mat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const createdChunks: DidacticChunk[] = [];

    for (const page of input.pages) {
      const pageChunks = this.splitPageIntoChunks(page.text, config);

      pageChunks.forEach((chunkText, idx) => {
        const chunkId = `chk-${materialId}-p${page.pageNumber}-${idx + 1}`;
        createdChunks.push({
          id: chunkId,
          materialId,
          bookTitle: input.title,
          author: input.author,
          chapter: page.chapter || `Capítulo Geral`,
          section: page.section || `Página ${page.pageNumber}`,
          pageNumber: page.pageNumber,
          content: chunkText,
        });
      });
    }

    // Indexa no repositório em memória do RAG Híbrido
    addChunksToCorpus(createdChunks);

    return {
      materialId,
      title: input.title,
      totalChunks: createdChunks.length,
      totalPages: input.pages.length,
      status: 'SUCCESS',
      indexedAt: new Date().toISOString(),
    };
  }

  /**
   * Divide o texto de uma página em chunks preservando fronteiras de frases
   */
  private splitPageIntoChunks(text: string, options: Required<ChunkingOptions>): string[] {
    const sanitized = text.replace(/\s+/g, ' ').trim();
    if (!sanitized) return [];

    if (sanitized.length <= options.maxChunkCharacters) {
      return [sanitized];
    }

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < sanitized.length) {
      let endIndex = startIndex + options.maxChunkCharacters;

      if (endIndex >= sanitized.length) {
        chunks.push(sanitized.slice(startIndex).trim());
        break;
      }

      // Tenta quebrar em ponto final ou pontuação
      const punctuationIndex = sanitized.lastIndexOf('.', endIndex);
      if (punctuationIndex > startIndex + options.overlapCharacters) {
        endIndex = punctuationIndex + 1;
      } else {
        // Tenta quebrar no último espaço
        const spaceIndex = sanitized.lastIndexOf(' ', endIndex);
        if (spaceIndex > startIndex + options.overlapCharacters) {
          endIndex = spaceIndex;
        }
      }

      const chunkSlice = sanitized.slice(startIndex, endIndex).trim();
      if (chunkSlice) {
        chunks.push(chunkSlice);
      }

      // Aplica overlap para manter contexto conceitual entre blocos
      startIndex = Math.max(startIndex + 1, endIndex - options.overlapCharacters);
    }

    return chunks;
  }
}

export const documentIngestionService = new DocumentIngestionService();
