/** Máximo de termos da consulta léxica (limita o custo da busca para mensagens longas). */
export const LEXICAL_MAX_TERMS = 32;

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/**
 * Monta a entrada de `to_tsquery` com semântica OR: cada palavra da mensagem vira um termo unido por `|`.
 *
 * `websearch_to_tsquery` exige todos os termos (AND), então palavras como "Quais" ou "Quanto", que não
 * aparecem no trecho, zeravam a recuperação sem embeddings. Com OR, o trecho que casa mais termos sobe
 * no `ts_rank_cd`; stopwords e radicais ficam por conta da configuração `portuguese` do `to_tsquery`.
 * Palavras de uma letra só (exceto dígitos) são descartadas. Só letras, marcas e dígitos passam, então operadores de tsquery do usuário nunca chegam ao parser.
 * Retorna null quando não sobra termo nenhum.
 */
export function buildLexicalOrQuery(query: string): string | null {
  const words = query.normalize('NFC').toLowerCase().match(WORD) ?? [];
  // Palavras de uma letra ("é", "a", "o") casam com quase todo trecho e "é" nem é stopword do Postgres.
  const useful = words.filter((w) => w.length > 1 || /\p{N}/u.test(w));
  const terms = Array.from(new Set(useful)).slice(0, LEXICAL_MAX_TERMS);
  return terms.length > 0 ? terms.join(' | ') : null;
}
