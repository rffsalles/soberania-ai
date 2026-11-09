/**
 * Relevância de trecho para um passo do roteiro quando a busca é só léxica (embeddings desligados).
 *
 * A busca léxica une os termos por OR e sempre devolve o trecho que casa alguma palavra, mesmo que o
 * assunto seja outro (ex.: "Reescrever uma junção como subquery" devolve o trecho de JOIN por causa de
 * "junção"). Sem similaridade para cortar, exigimos cobertura de termos do tópico do passo: o título da
 * atividade normalizado (minúsculas, sem acento, sem stopwords e rótulos de atividade, 4+ letras,
 * plural reduzido e radical truncado) precisa aparecer no trecho numa fração mínima.
 */

const MIN_TERM_LENGTH = 4;
/** Radical por truncamento: aproxima flexões ("relacionamento" ~ "relacional", "junção" ~ "junções"). */
const STEM_LENGTH = 6;

const STOPWORDS = new Set([
  'ainda', 'algum', 'alguma', 'algumas', 'alguns', 'antes', 'apenas', 'aquela', 'aquele', 'aquilo', 'aqui',
  'assim', 'cada', 'como', 'contra', 'dela', 'delas', 'dele', 'deles', 'depois', 'desde', 'dessa', 'desse',
  'desta', 'deste', 'deve', 'devem', 'durante', 'entao', 'entre', 'essa', 'essas', 'esse', 'esses', 'esta',
  'estar', 'estas', 'este', 'estes', 'fazer', 'foram', 'isso', 'isto', 'mais', 'menos', 'mesma', 'mesmo',
  'muita', 'muitas', 'muito', 'muitos', 'nada', 'nessa', 'nesse', 'nesta', 'neste', 'nossa', 'nosso', 'numa',
  'onde', 'outra', 'outras', 'outro', 'outros', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'pode', 'podem',
  'pois', 'porque', 'qual', 'quais', 'quando', 'quem', 'seja', 'sejam', 'sendo', 'sera', 'seus', 'sido',
  'sobre', 'suas', 'tambem', 'tinha', 'toda', 'todas', 'todo', 'todos', 'tudo', 'umas', 'voce', 'voces',
]);

/** Palavras que rotulam o formato da atividade, não o assunto ("Revisão: ...", "Exercício relâmpago: ..."). */
const ACTIVITY_LABEL_WORDS = new Set([
  'abertura', 'atividade', 'aula', 'dinamica', 'discussao', 'exercicio', 'fechamento', 'introducao',
  'pratica', 'pratico', 'relampago', 'retomada', 'revisao',
]);

function singular(word: string): string {
  if (word.endsWith('oes') || word.endsWith('aes')) return `${word.slice(0, -3)}ao`;
  if (word.endsWith('ais')) return `${word.slice(0, -3)}al`;
  if (word.endsWith('eis')) return `${word.slice(0, -3)}el`;
  if (word.endsWith('s') && word.length > MIN_TERM_LENGTH) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** Termos significativos (radicais) de um texto, sem repetição, na ordem em que aparecem. */
export function significantTerms(text: string): string[] {
  const terms: string[] = [];
  for (const word of words(text)) {
    if (word.length < MIN_TERM_LENGTH || STOPWORDS.has(word)) continue;
    const one = singular(word);
    if (STOPWORDS.has(one) || ACTIVITY_LABEL_WORDS.has(one)) continue;
    const stem = one.slice(0, STEM_LENGTH);
    if (!terms.includes(stem)) terms.push(stem);
  }
  return terms;
}

/** Tópico do passo: o título da atividade; a descrição só entra se o título não tiver termo significativo. */
export function stepTopicTerms(activity: string, description: string): string[] {
  const fromActivity = significantTerms(activity);
  return fromActivity.length > 0 ? fromActivity : significantTerms(description);
}

/** Quantos termos do tópico o trecho precisa conter: com 1 ou 2 termos, todos; senão a fração mínima, para cima. */
export function requiredMatches(termCount: number, minCoverage: number): number {
  if (termCount <= 2) return termCount;
  return Math.ceil(termCount * minCoverage);
}

/** O trecho (conteúdo + título do capítulo) cobre o tópico? Tópico vazio nunca é coberto. */
export function isLexicallyRelevant(topicTerms: string[], chunkText: string, minCoverage: number): boolean {
  if (topicTerms.length === 0) return false;
  const present = new Set(significantTermsLoose(chunkText));
  const matched = topicTerms.filter((t) => present.has(t)).length;
  return matched >= requiredMatches(topicTerms.length, minCoverage);
}

/** Radicais do trecho: sem descartar rótulos de atividade (no texto do livro eles podem ser assunto). */
function significantTermsLoose(text: string): string[] {
  return words(text)
    .filter((w) => w.length >= MIN_TERM_LENGTH)
    .map((w) => singular(w).slice(0, STEM_LENGTH));
}
