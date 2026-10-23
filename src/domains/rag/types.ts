export interface DidacticChunk {
  id: string;
  materialId: string;
  bookTitle: string;
  author: string;
  chapter: string;
  section?: string;
  pageNumber: number;
  content: string;
  category?: string;
  similarityScore?: number;
  bm25Score?: number;
  rrfScore?: number;
}

export interface RAGSearchQuery {
  query: string;
  subject?: string;
  subjectName?: string;
  categories?: string[];
  allowedMaterialIds?: string[];
  minRelevanceScore?: number;
  topK?: number;
}

export interface RAGSearchResult {
  query: string;
  chunks: DidacticChunk[];
  primaryCitation?: string;
  latencyMs: number;
}

export interface RawDocumentPage {
  pageNumber: number;
  chapter?: string;
  section?: string;
  text: string;
}

export interface MaterialIngestionInput {
  id?: string;
  title: string;
  author: string;
  edition?: string;
  subject: string;
  materialType?: 'BOOK' | 'SCIENTIFIC_PAPER' | 'INSTITUTIONAL_GUIDE';
  filePath?: string;
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
  isOcrApplied?: boolean;
  pages: RawDocumentPage[];
}

export interface IngestionResult {
  materialId: string;
  title: string;
  totalChunks: number;
  totalPages: number;
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR';
  indexedAt: string;
  isOcrApplied?: boolean;
  createdChunks?: DidacticChunk[];
}


export interface ParseDocumentOptions {
  /** Limita o parse às primeiras N páginas (PDF). Sem valor, parseia o documento inteiro. */
  maxPages?: number;
  /** Não tenta OCR mesmo quando o PDF parece escaneado (inspeção rápida). */
  skipOcr?: boolean;
}

export interface ParsedDocumentResult {
  title?: string;
  totalPages: number;
  pages: RawDocumentPage[];
  isOcrApplied: boolean;
  /** true quando o documento escaneado tinha mais páginas que OCR_MAX_PAGES; o restante ficou sem texto. */
  ocrPartial?: boolean;
  detectedMimeType: string;
  /** Metadados embutidos no arquivo (Info do PDF), quando existirem. */
  info?: { title?: string; author?: string };
}

