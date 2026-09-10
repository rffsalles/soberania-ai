export interface DidacticChunk {
  id: string;
  materialId: string;
  bookTitle: string;
  author: string;
  chapter: string;
  section?: string;
  pageNumber: number;
  content: string;
  similarityScore?: number;
  bm25Score?: number;
  rrfScore?: number;
}

export interface RAGSearchQuery {
  query: string;
  subject?: string;
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
  title: string;
  author: string;
  edition?: string;
  subject: string;
  materialType?: 'BOOK' | 'SCIENTIFIC_PAPER' | 'INSTITUTIONAL_GUIDE';
  pages: RawDocumentPage[];
}

export interface IngestionResult {
  materialId: string;
  title: string;
  totalChunks: number;
  totalPages: number;
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR';
  indexedAt: string;
}
