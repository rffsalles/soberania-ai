/** Reciprocal Rank Fusion constant: score = Σ 1 / (RRF_K + rank). */
export const RRF_K = 60;

/** Candidates taken from each branch (vector and lexical) before fusion. */
export const HYBRID_CANDIDATE_LIMIT = 50;

/** Text search configuration used by `material_chunks.content_tsv` (see migration pgvector_fulltext). */
export const FULL_TEXT_LANGUAGE = 'portuguese';

/** Rótulo de capítulo dos trechos sintéticos (DOCX/TXT/MD não têm páginas reais); citações omitem "pág." para eles. */
export const SYNTHETIC_CHAPTER_PATTERN = /^Trecho \d+$/;
export function isSyntheticChapter(chapter: string): boolean {
  return SYNTHETIC_CHAPTER_PATTERN.test(chapter.split(':')[0]);
}

export const DEFAULT_TOP_K = 3;
export const RAG_MIN_TOP_K = 1;
export const RAG_MAX_TOP_K = 50;
