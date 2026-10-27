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

/** Páginas iniciais do PDF enviadas à IA para localizar o sumário. */
export const CHAPTER_TOC_PAGES = 15;
/** Máximo de caracteres por página no prompt do sumário. */
export const CHAPTER_TOC_PAGE_CHARS = 1200;
/** Mínimo de capítulos para considerar uma extração válida. */
export const MIN_EXTRACTED_CHAPTERS = 2;

/** Máximo de caracteres do título de um capítulo (após trim). */
export const CHAPTER_TITLE_MAX = 200;
/** Máximo de nós (capítulos + subníveis) aceitos por material. */
export const MAX_CHAPTER_NODES = 500;
/** Profundidade máxima da árvore de capítulos (raiz = 0). */
export const MAX_CHAPTER_DEPTH = 6;
/** Páginas de sumário detectadas fora da janela inicial, no máximo, por material. */
export const CHAPTER_TOC_EXTRA_PAGES = 10;
/** Máximo de caracteres por página de sumário detectada (usado na extração por IA). */
export const CHAPTER_TOC_DETECTED_PAGE_CHARS = 4000;
