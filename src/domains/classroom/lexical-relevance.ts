/**
 * Relevância de trecho para um passo do roteiro quando a busca é só léxica (sem similaridade).
 *
 * A busca léxica une os termos por OR e sempre devolve o trecho que casa alguma palavra, mesmo que o
 * assunto seja outro (ex.: "Reescrever uma junção como subquery" devolve o trecho de JOIN por causa de
 * "junção"). Sem similaridade para cortar, exigimos cobertura de termos do tópico do passo: o título da
 * atividade normalizado (minúsculas, sem acento, sem stopwords e rótulos de atividade, 4+ letras,
 * plural reduzido e radical truncado) precisa aparecer no trecho numa fração mínima. Siglas de 2 ou 3
 * caracteres (SQL, DER, 3FN) entram inteiras, sem radical, e casam sem diferenciar caixa.
 *
 * Trade-offs aceitos:
 * - Radical por truncamento em 6 letras, não um stemmer: une flexões ("junção"/"junções",
 *   "relacionamentos"/"Relacionais"), mas também palavras distintas com o mesmo prefixo
 *   ("normalização"/"normal", falso positivo) e separa derivações com prefixo diferente
 *   ("índice"/"indexação", falso negativo).
 * - `singular()` é uma redução de plural ingênua (ões/ães, ais, eis, s final), não morfologia.
 * - O que garante consistência é a simetria: tópico e trecho passam pela mesma normalização, então um
 *   erro de radical só importa quando colapsa palavras de assuntos diferentes.
 */

const MIN_TERM_LENGTH = 4;
/** Radical por truncamento: aproxima flexões ("relacionamento" ~ "relacional", "junção" ~ "junções"). */
const STEM_LENGTH = 6;

/** Palavras curtas que nunca são sigla, mesmo em título todo maiúsculo ("MODELO DE DADOS"). */
const SHORT_STOPWORDS = new Set([
  'ao', 'aos', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'em', 'na', 'nas', 'no', 'nos', 'os', 'ou', 'por',
  'que', 'se', 'sem', 'um', 'uma', 'uns',
]);

const STOPWORDS = new Set([
  'ainda', 'algum', 'alguma', 'algumas', 'alguns', 'antes', 'apenas', 'aquela', 'aquele', 'aquilo', 'aqui',
  'assim', 'cada', 'como', 'contra', 'dela', 'delas', 'dele', 'deles', 'depois', 'desde', 'dessa', 'desse',
  'desta', 'deste', 'deve', 'devem', 'durante', 'entao', 'entre', 'essa', 'essas', 'esse', 'esses', 'esta',
  'estar', 'estas', 'este', 'estes', 'fazer', 'foram', 'isso', 'isto', 'mais', 'menos', 'mesma', 'mesmo',
  'muita', 'muitas', 'muito', 'muitos', 'nada', 'nessa', 'nesse', 'nesta', 'neste', 'nossa', 'nosso', 'numa',
  'onde', 'outra', 'outras', 'outro', 'outros', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'pode', 'podem',
  'pois', 'porque', 'qual', 'quais', 'quando', 'quem', 'seja', 'sejam', 'sendo', 'sera', 'seus', 'sido',
  'sobre', 'suas', 'tambem', 'tinha', 'toda', 'todas', 'todo', 'todos', 'tudo', 'umas', 'voce', 'voces',
  'usando', 'utilizando', 'criando', 'tipos',
]);

/** Palavras que rotulam o formato da atividade, não o assunto ("Revisão: ...", "Exercício relâmpago: ..."). */
const ACTIVITY_LABEL_WORDS = new Set([
  'abertura', 'apresentacao', 'atividade', 'aula', 'avaliacao', 'avancado', 'basico', 'caso', 'conceito',
  'conclusao', 'correcao', 'debate', 'demonstracao', 'dinamica', 'discussao', 'duvidas', 'encerramento',
  'estudo', 'exemplo', 'exercicio', 'fechamento', 'fundamentos', 'geral', 'intervalo', 'introducao',
  'laboratorio', 'modulo', 'oficina', 'pausa', 'pratica', 'pratico', 'quiz', 'relampago', 'resumo',
  'retomada', 'revisao', 'tema', 'unidade',
]);

function singular(word: string): string {
  if (word.endsWith('oes') || word.endsWith('aes')) return `${word.slice(0, -3)}ao`;
  if (word.endsWith('ais')) return `${word.slice(0, -3)}al`;
  if (word.endsWith('eis')) return `${word.slice(0, -3)}el`;
  if (word.endsWith('s') && word.length > MIN_TERM_LENGTH) return word.slice(0, -1);
  return word;
}

/** Palavras sem acento, na caixa original (a caixa decide se um token curto é sigla). */
function rawWords(text: string): string[] {
  return text.normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Sigla curta: 2 ou 3 caracteres, todo maiúsculo ou com dígito ("SQL", "3FN"), e não preposição. */
function shortAcronym(raw: string): string | null {
  if (raw.length < 2 || raw.length >= MIN_TERM_LENGTH) return null;
  const isAcronym = /\p{N}/u.test(raw) || raw === raw.toUpperCase();
  const lower = raw.toLowerCase();
  return isAcronym && !SHORT_STOPWORDS.has(lower) ? lower : null;
}

function isNoise(word: string): boolean {
  return STOPWORDS.has(word) || ACTIVITY_LABEL_WORDS.has(word);
}

/** Termos significativos (radicais e siglas) de um texto, sem repetição, na ordem em que aparecem. */
export function significantTerms(text: string): string[] {
  const terms: string[] = [];
  const add = (t: string) => {
    if (!terms.includes(t)) terms.push(t);
  };
  for (const raw of rawWords(text)) {
    const acronym = shortAcronym(raw);
    if (acronym) {
      add(acronym);
      continue;
    }
    const word = raw.toLowerCase();
    if (word.length < MIN_TERM_LENGTH || isNoise(word)) continue;
    const one = singular(word);
    if (isNoise(one)) continue;
    add(one.slice(0, STEM_LENGTH));
  }
  return terms;
}

/**
 * Tópico do passo: o título da atividade; se ele não tiver termo significativo, a descrição; se ainda
 * vazio, a consulta que a busca usou. Pode voltar vazio (ex.: "Intervalo" sem descrição).
 */
export function stepTopicTerms(activity: string, description: string, searchQuery = ''): string[] {
  for (const text of [activity, description, searchQuery]) {
    const terms = significantTerms(text);
    if (terms.length > 0) return terms;
  }
  return [];
}

/** Quantos termos do tópico o trecho precisa conter: com 1 ou 2 termos, todos; senão a fração mínima, para cima. */
export function requiredMatches(termCount: number, minCoverage: number): number {
  if (termCount <= 2) return termCount;
  return Math.ceil(termCount * minCoverage);
}

/** O trecho (conteúdo + título do capítulo) cobre o tópico? Tópico vazio nunca é coberto. */
export function isLexicallyRelevant(topicTerms: string[], chunkText: string, minCoverage: number): boolean {
  if (topicTerms.length === 0) return false;
  const present = chunkTerms(chunkText);
  const matched = topicTerms.filter((t) => present.has(t)).length;
  return matched >= requiredMatches(topicTerms.length, minCoverage);
}

/**
 * Termos do trecho: radicais das palavras de 4+ letras (sem descartar rótulos, que no livro podem ser
 * assunto) e todo token de 2 ou 3 caracteres em minúsculas, para a sigla do tópico casar em qualquer caixa.
 */
function chunkTerms(text: string): Set<string> {
  const terms = new Set<string>();
  for (const raw of rawWords(text)) {
    const word = raw.toLowerCase();
    if (word.length >= MIN_TERM_LENGTH) terms.add(singular(word).slice(0, STEM_LENGTH));
    else if (word.length >= 2) terms.add(word);
  }
  return terms;
}
