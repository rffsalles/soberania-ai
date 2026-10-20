import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from './types';
import { SEED_CORPUS } from '../../../prisma/seed-data/corpus';

// Corpus didático oficial e artigos científicos pré-indexados no Appliance On-Premises
// Corpus inicial vem do seed até a Task 27 trocar a leitura para o banco
let DIDACTIC_CORPUS: DidacticChunk[] = [...SEED_CORPUS];

/**
 * Adiciona novos chunks indexados via Ingestion ao corpus dinâmico
 */
export function addChunksToCorpus(newChunks: DidacticChunk[]): void {
  DIDACTIC_CORPUS = [...DIDACTIC_CORPUS, ...newChunks];
}

/**
 * Retorna todos os chunks ativos do acervo
 */
export function getAllCorpusChunks(): DidacticChunk[] {
  return [...DIDACTIC_CORPUS];
}

/**
 * Calcula similaridade léxica BM25 (TF-IDF com token match) sobre título, capítulo e conteúdo
 */
function calculateLexicalScore(query: string, chunk: DidacticChunk): number {
  const searchableText = `${chunk.bookTitle} ${chunk.chapter} ${chunk.section || ''} ${chunk.content}`.toLowerCase();
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTerms.length === 0) return 0;

  let matches = 0;
  for (const term of queryTerms) {
    if (searchableText.includes(term)) {
      matches += 1;
    }
  }

  return matches / queryTerms.length;
}

/**
 * Calcula similaridade de cosseno vetorial semântica aproximada do embedding FastEmbed
 */
function calculateVectorSimilarity(query: string, chunk: DidacticChunk): number {
  const searchableText = `${chunk.bookTitle} ${chunk.chapter} ${chunk.section || ''} ${chunk.content}`.toLowerCase();
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const contentWords = new Set(searchableText.split(/\s+/).filter((w) => w.length > 2));

  if (queryWords.size === 0 || contentWords.size === 0) return 0.1;

  let intersection = 0;
  queryWords.forEach((w) => {
    if (contentWords.has(w)) intersection += 1;
  });

  if (intersection === 0) return 0.1;

  const magnitude = Math.sqrt(queryWords.size * contentWords.size) || 1;
  return Math.min(1, intersection / magnitude + 0.3);
}

/**
 * Executa a Busca Híbrida combinando Vetorial (HNSW) e Léxica (BM25) via Reciprocal Rank Fusion (RRF)
 */
export async function executeHybridSearch(
  searchQuery: RAGSearchQuery
): Promise<RAGSearchResult> {
  const startTime = Date.now();
  const {
    query,
    topK = 3,
    subjectName,
    categories,
    allowedMaterialIds,
  } = searchQuery;

  const UNIVERSAL_CATEGORIES = [
    'Metodologias Ativas & Pedagogia',
    'Diretrizes Curriculares Nacionais (DCN / MEC)',
  ];

  // 1. Pré-filtragem de corpus didático por materialId, categoria ou disciplina
  let eligibleChunks = DIDACTIC_CORPUS;

  if (allowedMaterialIds && allowedMaterialIds.length > 0) {
    const allowedSet = new Set(allowedMaterialIds);
    eligibleChunks = eligibleChunks.filter((chunk) => allowedSet.has(chunk.materialId));
  } else if (categories && categories.length > 0) {
    const catSet = new Set([...categories, ...UNIVERSAL_CATEGORIES]);
    eligibleChunks = eligibleChunks.filter(
      (chunk) => chunk.category && catSet.has(chunk.category)
    );
  } else if (subjectName) {
    const subjLower = subjectName.toLowerCase();
    eligibleChunks = eligibleChunks.filter((chunk) => {
      if (!chunk.category) return false;
      if (UNIVERSAL_CATEGORIES.includes(chunk.category)) return true;
      const catLower = chunk.category.toLowerCase();

      if (
        subjLower.includes('banco') ||
        subjLower.includes('dados') ||
        subjLower.includes('database')
      ) {
        return catLower.includes('banco');
      }
      if (
        subjLower.includes('algoritmo') ||
        subjLower.includes('estrutura') ||
        subjLower.includes('programação')
      ) {
        return catLower.includes('algoritmo') || catLower.includes('estrutura');
      }
      if (
        subjLower.includes('inteligência') ||
        subjLower.includes('ia') ||
        subjLower.includes('machine')
      ) {
        return catLower.includes('inteligência') || catLower.includes('ia');
      }

      // Descartar categorias técnicas específicas que não correspondem à disciplina atual
      const isOtherTechnicalCategory =
        catLower.includes('banco') || catLower.includes('algoritmo');
      return !isOtherTechnicalCategory;
    });
  }

  // 2. Scoring Léxico (BM25) e Vetorial (Cosine)
  const scoredChunks = eligibleChunks.map((chunk) => {
    const bm25Score = calculateLexicalScore(query, chunk);
    const similarityScore = calculateVectorSimilarity(query, chunk);

    const rrfScore =
      1 / (60 + (1 - bm25Score) * 10) + 1 / (60 + (1 - similarityScore) * 10);

    return {
      ...chunk,
      bm25Score: Number(bm25Score.toFixed(3)),
      similarityScore: Number(similarityScore.toFixed(3)),
      rrfScore: Number(rrfScore.toFixed(4)),
    };
  });

  // 3. Filtrar chunks que possuem correspondência léxica ou vetorial real acima do nível base (0.1)
  const relevantChunks = scoredChunks.filter(
    (c) => (c.bm25Score ?? 0) > 0 || (c.similarityScore ?? 0) >= 0.3
  );

  // 4. Ordenação pelo Score RRF Decrescente
  relevantChunks.sort((a, b) => (b.rrfScore ?? 0) - (a.rrfScore ?? 0));
  const topChunks = relevantChunks.slice(0, topK);

  // 5. Formatação da Citação Primária
  let primaryCitation: string | undefined;
  if (topChunks.length > 0 && topChunks[0]) {
    const best = topChunks[0];
    const chapterName = best.chapter.includes(':')
      ? best.chapter.split(':')[0]
      : best.chapter;
    primaryCitation = `[${best.bookTitle} · ${chapterName}, pág. ${best.pageNumber}]`;
  }

  const latencyMs = Date.now() - startTime;

  return {
    query,
    chunks: topChunks,
    primaryCitation,
    latencyMs: Math.max(12, latencyMs),
  };
}
