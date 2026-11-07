// Módulo puro (sem banco): pode ser importado por componentes de cliente.

/** Sem acentos, minúsculo e com espaços simples: os padrões abaixo são escritos nessa forma. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const GIVE = '(?:da|de|dar|passa|passe|passar|diz|diga|dizer|fala|fale|falar|manda|mande|mandar|envia|envie|conta|conte|entrega|entregue|mostra|mostre)';
const ANSWER_NOUN = '(?:resposta|respostas|alternativa|letra|opcao|resultado|solucao|gabarito)';
const TASK = '(?:questao|questoes|exercicio|exercicios|atividade|lista|prova|problema|pergunta|tarefa|item)';
const DET = '(?:isso|isto|essa|esta|essas|estas|esse|este|aquela|aquele|a|o|as|os|minha|meu)';
const NUM = '(?:n[o°º]?\\.? ?)?\\d+';
const SOLVE = '(?:resolve|resolva|resolver|faz|faca|fazer|responde|responda|responder)';
const ONLY = '(?:so|somente|apenas)';

/**
 * Formas de pedir a resposta final em vez de ajuda para chegar nela: gabarito, letra/alternativa certa,
 * "me dá a resposta", "resolve pra mim", "responde a questão 3", "só quero o número", "responde só sim ou
 * não", texto pronto para copiar e menção a uma questão numerada de avaliação.
 */
const ANSWER_REQUEST_PATTERNS: RegExp[] = [
  /\bgabaritos?\b/,
  new RegExp(`\\b${ANSWER_NOUN} (?:certa|correta|certo|correto|final|pronta|exata)\\b`),
  new RegExp(`\\b(?:me|nos) ${GIVE}(?: (?:logo|ai|so|ja|direto|rapido))* (?:a|as|o|os|qual) ${ANSWER_NOUN}\\b`),
  new RegExp(`\\bqual (?:e |eh |seria |vai ser )?(?:a )?(?:resposta|alternativa|letra|opcao)\\b`),
  new RegExp(`\\b${ONLY} (?:quero|preciso)(?: saber)? (?:a|o) (?:resposta|letra|alternativa|opcao|numero|resultado)\\b`),
  new RegExp(`\\b(?:quero|preciso)(?: saber)? ${ONLY} (?:a|o) (?:resposta|letra|alternativa|opcao|numero|resultado)\\b`),
  new RegExp(`\\b(?:responde|responda|responder|diz|diga|fala|fale) ${ONLY} (?:com )?(?:sim ou nao|a letra|o numero|o resultado)\\b`),
  new RegExp(`\\b${SOLVE}(?: ${DET})?(?: ${TASK})?(?: ${NUM})? (?:pra|para|por) mim\\b`),
  new RegExp(`(?<!como )(?<!como eu )\\b(?:responde|responda|resolve|resolva)(?: ${DET})? ${TASK}(?: ${NUM})?\\b`),
  /\b(?:pronta|pronto|prontas|prontos)\b[^.?!]{0,30}\b(?:copiar|colar|entregar)\b/,
  /\b(?:pra|para) (?:eu )?(?:copiar|colar)\b/,
  new RegExp(`\\b(?:questao|exercicio|item) ${NUM} d[aoe]s? (?:avaliacao|prova|lista|teste|simulado|atividade)\\b`),
];

/** A mensagem pede a resposta pronta (ou cita uma questão de avaliação) em vez de ajuda para raciocinar? */
export function isAnswerRequest(message: string): boolean {
  const text = normalize(message);
  return ANSWER_REQUEST_PATTERNS.some((p) => p.test(text));
}

/** Instrução extra do prompt de sala de aula quando o aluno pede a resposta pronta. */
export const ANSWER_REQUEST_RULES = `
PEDIDO DE RESPOSTA PRONTA (obrigatório nesta mensagem):
- O aluno pediu a resposta pronta (gabarito, letra, alternativa, número, sim/não, definição para copiar ou a resolução). Não entregue a resposta final: não diga qual é a letra, a alternativa, o resultado ou o termo que responde à questão, e não anuncie nem comente o gabarito.
- Isso não é pergunta fora do material: não diga que não encontrou no material. Trate o pedido como uma dúvida sobre o tema e conduza o raciocínio pelo método socrático.
- Use os trechos do material para guiar, não para responder: indique onde olhar (o rótulo [FONTE: ...]) e pergunte sobre o conceito. Não transcreva nem parafraseie a definição ou a frase do trecho que responde à questão.
- Termine obrigatoriamente com uma pergunta ao aluno.
`;

/** Pergunta de condução genérica, acrescentada quando a resposta não devolve pergunta ao aluno. */
export const ANSWER_REQUEST_FOLLOW_UP =
  'Com base no material, qual conceito você acha que resolve essa questão e por quê?';

const SENTENCE = /[^.!?\n]+(?:[.!?]+["')\]]*|$)/g;

function sentences(text: string): string[] {
  return text.match(SENTENCE)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

function words(text: string): string[] {
  return normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Mínimo de palavras seguidas iguais ao trecho para a frase contar como transcrição. */
export const VERBATIM_MIN_WORDS = 8;

function copiesExcerpt(sentence: string, excerpts: string[][], minWords: number): boolean {
  const w = words(sentence);
  if (w.length < minWords) return false;
  for (let i = 0; i + minWords <= w.length; i++) {
    const window = ` ${w.slice(i, i + minWords).join(' ')} `;
    if (excerpts.some((e) => ` ${e.join(' ')} `.includes(window))) return true;
  }
  return false;
}

/**
 * Em sala, diante de um pedido de resposta pronta, a frase que transcreve um trecho recuperado costuma ser a
 * própria resposta (a definição que resolve a questão). Remove as frases com `minWords` palavras seguidas
 * iguais a algum trecho; o resto (onde olhar, a pergunta ao aluno) fica.
 */
export function stripVerbatimExcerpts(
  text: string,
  chunks: { content: string }[],
  minWords = VERBATIM_MIN_WORDS
): { text: string; removed: string[] } {
  const excerpts = chunks.map((c) => words(c.content));
  const removed: string[] = [];
  const kept = sentences(text).filter((s) => {
    if (!copiesExcerpt(s, excerpts, minWords)) return true;
    removed.push(s);
    return false;
  });
  return { text: removed.length > 0 ? kept.join(' ') : text, removed };
}

const NOT_FOUND_SENTENCE = /^n[aã]o (?:encontrei|achei|localizei|h[aá])\b[^.!?]*\bmaterial\b/iu;

/** Garante que a resposta termine com uma pergunta ao aluno. */
export function ensureEndsWithQuestion(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return ANSWER_REQUEST_FOLLOW_UP;
  if (/\?["')\]]*$/.test(trimmed)) return trimmed;
  return `${trimmed} ${ANSWER_REQUEST_FOLLOW_UP}`;
}

/**
 * Pós-processamento de sala de aula para pedido de resposta pronta: tira a recusa "não encontrei no
 * material" (o pedido é sobre o tema, não fora dele), tira frases que transcrevem o trecho e garante que a
 * resposta termine com pergunta.
 */
export function guideAnswerRequestReply(text: string, chunks: { content: string }[]): string {
  const withoutRefusal = sentences(text).filter((s) => !NOT_FOUND_SENTENCE.test(s));
  const base = withoutRefusal.length === sentences(text).length ? text : withoutRefusal.join(' ');
  return ensureEndsWithQuestion(stripVerbatimExcerpts(base, chunks).text);
}
