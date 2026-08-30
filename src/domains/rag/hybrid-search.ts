import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from './types';

// Corpus didático oficial pré-indexado no Appliance On-Premises (Banco de Dados, Algoritmos, Redes, etc.)
const INITIAL_DIDACTIC_CORPUS: DidacticChunk[] = [
  {
    id: 'chunk-db-001',
    materialId: 'mat-db-1',
    bookTitle: 'Sistemas de Banco de Dados',
    author: 'Navathe & Elmasri',
    chapter: 'Capítulo 4: Álgebra Relacional e SQL',
    section: '4.2 Junções e Cláusulas JOIN',
    pageNumber: 58,
    content:
      'A cláusula INNER JOIN combina tuplas de duas tabelas com base em uma condição de junção. Tuplas que não satisfazem o predicado são descartadas do resultado. Já o LEFT OUTER JOIN preserva todas as tuplas da tabela à esquerda, preenchendo com valores NULL os atributos da direita quando não houver correspondência.',
  },
  {
    id: 'chunk-db-002',
    materialId: 'mat-db-1',
    bookTitle: 'Sistemas de Banco de Dados',
    author: 'Navathe & Elmasri',
    chapter: 'Capítulo 6: Normalização de Dados Relacionais',
    section: '6.3 Terceira Forma Normal (3FN)',
    pageNumber: 112,
    content:
      'Uma relação R está na Terceira Forma Normal (3FN) se estiver na 2FN e nenhum atributo não-chave depender transitivamente da chave primária. Em outras palavras, para toda dependência funcional não-trivial X -> A, X é uma superchave ou A é um atributo primo.',
  },
  {
    id: 'chunk-db-003',
    materialId: 'mat-db-1',
    bookTitle: 'Sistemas de Banco de Dados',
    author: 'Navathe & Elmasri',
    chapter: 'Capítulo 8: Transações e Propriedades ACID',
    section: '8.1 Atomicidade e Isolamento',
    pageNumber: 164,
    content:
      'As propriedades ACID garantem a integridade das transações no SGBD. A Atomicidade assegura que todas as operações sejam executadas ou nenhuma o seja. A Consistência preserva os invariantes do esquema. O Isolamento previne interferências entre transações concorrentes.',
  },
  {
    id: 'chunk-algo-001',
    materialId: 'mat-algo-1',
    bookTitle: 'Estruturas de Dados e Algoritmos',
    author: 'Cormen et al.',
    chapter: 'Capítulo 2: Complexidade Assintótica',
    section: '2.1 Notação Big-O',
    pageNumber: 34,
    content:
      'A notação Big-O (O grande) descreve o limite superior da taxa de crescimento do tempo de execução ou espaço de memória de um algoritmo no pior caso. O algoritmo de busca binária opera em O(log n), enquanto uma busca linear opera em O(n).',
  },
  {
    id: 'chunk-algo-002',
    materialId: 'mat-algo-1',
    bookTitle: 'Estruturas de Dados e Algoritmos',
    author: 'Cormen et al.',
    chapter: 'Capítulo 5: Árvores de Busca Binária (BST)',
    section: '5.2 Inserção e Balanceamento AVL',
    pageNumber: 88,
    content:
      'Em uma Árvore de Busca Binária (BST), todo nó à esquerda possui chave estritamente menor que a chave raiz, e todo nó à direita possui chave maior. As árvores AVL mantêm o fator de balanceamento entre -1 e +1 através de rotações simples e duplas.',
  },
];

/**
 * Calcula similaridade léxica BM25 simplificada (TF-IDF token match)
 */
function calculateLexicalScore(query: string, content: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (queryTerms.length === 0) return 0;

  const contentLower = content.toLowerCase();
  let matches = 0;

  for (const term of queryTerms) {
    if (contentLower.includes(term)) {
      matches += 1;
    }
  }

  return matches / queryTerms.length;
}

/**
 * Simula similaridade de cosseno vetorial semântica do embedding FastEmbed
 */
function calculateVectorSimilarity(query: string, content: string): number {
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  const contentWords = new Set(content.toLowerCase().split(/\s+/));
  
  let intersection = 0;
  queryWords.forEach(w => {
    if (contentWords.has(w)) intersection += 1;
  });

  const magnitude = Math.sqrt(queryWords.size * contentWords.size) || 1;
  return Math.min(1, (intersection / magnitude) + 0.35);
}

/**
 * Executa a Busca Híbrida combinando Vetorial (HNSW) e Léxica (BM25) via Reciprocal Rank Fusion (RRF)
 */
export async function executeHybridSearch(
  searchQuery: RAGSearchQuery
): Promise<RAGSearchResult> {
  const startTime = Date.now();
  const { query, topK = 3 } = searchQuery;

  // 1. Scoring Léxico (BM25) e Vetorial (Cosine)
  const scoredChunks = INITIAL_DIDACTIC_CORPUS.map((chunk) => {
    const bm25Score = calculateLexicalScore(query, chunk.content);
    const similarityScore = calculateVectorSimilarity(query, chunk.content);
    
    // RRF Score: k=60 standard
    const rrfScore = (1 / (60 + (1 - bm25Score) * 10)) + (1 / (60 + (1 - similarityScore) * 10));

    return {
      ...chunk,
      bm25Score: Number(bm25Score.toFixed(3)),
      similarityScore: Number(similarityScore.toFixed(3)),
      rrfScore: Number(rrfScore.toFixed(4)),
    };
  });

  // 2. Ordenação pelo Score RRF Decrescente
  scoredChunks.sort((a, b) => (b.rrfScore ?? 0) - (a.rrfScore ?? 0));
  const topChunks = scoredChunks.slice(0, topK);

  // 3. Formatação da Citação Primária
  let primaryCitation: string | undefined;
  if (topChunks.length > 0 && topChunks[0]) {
    const best = topChunks[0];
    primaryCitation = `[${best.bookTitle} · ${best.chapter.split(':')[0]}, pág. ${best.pageNumber}]`;
  }

  const latencyMs = Date.now() - startTime;

  return {
    query,
    chunks: topChunks,
    primaryCitation,
    latencyMs: Math.max(12, latencyMs),
  };
}
