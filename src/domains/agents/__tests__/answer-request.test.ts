import { describe, it, expect } from 'vitest';
import {
  ANSWER_REQUEST_FOLLOW_UP,
  ensureEndsWithQuestion,
  guideAnswerRequestReply,
  isAnswerRequest,
  stripVerbatimExcerpts,
} from '../answer-request';

describe('isAnswerRequest', () => {
  it.each([
    'Qual é o gabarito da prova de ontem?',
    'me dá a resposta logo',
    'Me passa a resposta da questão 4, por favor',
    'Qual a alternativa certa?',
    'qual é a letra correta nessa?',
    'Resolve pra mim esse exercício',
    'faz a lista 3 para mim',
    'Responde a questão 5',
    'responda o exercício nº 2',
    'Só quero a letra.',
    'quero só o resultado final',
    'Responde só sim ou não.',
    'Escreve o código pronto pra eu copiar',
    'me manda a definição pronta pra colar no relatório',
    'O que cai na questão 3 da prova de amanhã?',
    'Qual é a resposta correta?',
  ])('detecta pedido de resposta pronta: %s', (msg) => {
    expect(isAnswerRequest(msg)).toBe(true);
  });

  it.each([
    'Quando uma relação está na Terceira Forma Normal?',
    'Qual a diferença entre INNER JOIN e LEFT JOIN?',
    'O que o Isolamento previne nas transações?',
    'Quais são as propriedades ACID?',
    'Acho que a resposta é a atomicidade.',
    'Não entendi a sua resposta, pode explicar de novo?',
    'Como eu resolvo um problema de dependência transitiva?',
    'Agora isso faz sentido pra mim.',
    'Qual a complexidade da busca binária?',
    'oi, tudo bem?',
  ])('não trata pergunta de conteúdo como pedido de gabarito: %s', (msg) => {
    expect(isAnswerRequest(msg)).toBe(false);
  });
});

describe('ensureEndsWithQuestion', () => {
  it('mantém resposta que já termina com pergunta', () => {
    expect(ensureEndsWithQuestion('Pense nas dependências. O que depende de quem?')).toBe(
      'Pense nas dependências. O que depende de quem?'
    );
  });

  it('acrescenta pergunta de condução quando a resposta não termina com pergunta', () => {
    const out = ensureEndsWithQuestion('Releia o trecho sobre junções no material.');
    expect(out).toBe(`Releia o trecho sobre junções no material. ${ANSWER_REQUEST_FOLLOW_UP}`);
    expect(out.trim().endsWith('?')).toBe(true);
  });

  it('resposta vazia vira só a pergunta de condução', () => {
    expect(ensureEndsWithQuestion('  ')).toBe(ANSWER_REQUEST_FOLLOW_UP);
  });
});

const joinChunk = {
  content:
    'A cláusula INNER JOIN combina tuplas de duas tabelas com base em uma condição de junção. Já o LEFT OUTER JOIN preserva todas as tuplas da tabela à esquerda, preenchendo com valores NULL os atributos da direita quando não houver correspondência.',
};

describe('stripVerbatimExcerpts', () => {
  it('remove a frase que transcreve um trecho do material', () => {
    const reply =
      'Olhe o Capítulo 4. Lá diz que o LEFT OUTER JOIN preserva todas as tuplas da tabela à esquerda, preenchendo com NULL. O que acontece com o estudante sem matrícula?';
    const out = stripVerbatimExcerpts(reply, [joinChunk]);
    expect(out.text).toBe('Olhe o Capítulo 4. O que acontece com o estudante sem matrícula?');
    expect(out.removed).toHaveLength(1);
  });

  it('mantém frases que só usam termos do trecho sem copiá-lo', () => {
    const reply = 'Compare o INNER JOIN com as junções externas. O que acontece com as tuplas sem correspondência?';
    expect(stripVerbatimExcerpts(reply, [joinChunk]).text).toBe(reply);
  });
});

describe('guideAnswerRequestReply', () => {
  it('tira a recusa de fora do material e garante a pergunta ao aluno', () => {
    const out = guideAnswerRequestReply(
      'Não encontrei no material o gabarito dessa questão. Posso ajudar a analisar a definição de 3FN.',
      []
    );
    expect(out).not.toMatch(/não encontrei/i);
    expect(out.trim().endsWith('?')).toBe(true);
  });

  it('com tudo removido sobra só a pergunta de condução', () => {
    const out = guideAnswerRequestReply('Não encontrei isso no material da disciplina.', []);
    expect(out).toBe(ANSWER_REQUEST_FOLLOW_UP);
  });
});
