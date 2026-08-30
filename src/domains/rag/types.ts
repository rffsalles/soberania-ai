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
