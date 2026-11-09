import { describe, expect, it } from 'vitest';
import { TUTOR_MIN_TERM_COVERAGE as COVERAGE } from '../tutor-step-content';
import {
  isLexicallyRelevant,
  requiredMatches,
  significantTerms,
  stepTopicTerms,
} from '../lexical-relevance';

// Trechos e títulos iguais aos do acervo do seed (Sistemas de Banco de Dados).
const CAP4 = {
  chapter: 'Capítulo 4: Álgebra Relacional e SQL',
  content:
    'A cláusula INNER JOIN combina tuplas de duas tabelas com base em uma condição de junção. Tuplas que não satisfazem o predicado são descartadas do resultado. Já o LEFT OUTER JOIN preserva todas as tuplas da tabela à esquerda, preenchendo com valores NULL os atributos da direita quando não houver correspondência.',
};
const CAP6 = {
  chapter: 'Capítulo 6: Normalização de Dados Relacionais',
  content:
    'Uma relação R está na Terceira Forma Normal (3FN) se estiver na 2FN e nenhum atributo não-chave depender transitivamente da chave primária. Em outras palavras, para toda dependência funcional não-trivial X -> A, X é uma superchave ou A é um atributo primo.',
};
const CAP8 = {
  chapter: 'Capítulo 8: Transações e Propriedades ACID',
  content:
    'As propriedades ACID garantem a integridade das transações no SGBD. A Atomicidade assegura que todas as operações sejam executadas ou nenhuma o seja. A Consistência preserva os invariantes do esquema. O Isolamento previne interferências entre transações concorrentes.',
};

describe('significantTerms', () => {
  it('tira acento, caixa, stopwords e palavras com menos de 4 letras', () => {
    expect(significantTerms('Sobre a JUNÇÃO de uma tabela com outra')).toEqual(['juncao', 'tabela']);
  });

  it('reduz plural e radical: chaves = chave, junções = junção, relacionamentos ~ relacionais', () => {
    expect(significantTerms('chaves')).toEqual(significantTerms('chave'));
    expect(significantTerms('junções')).toEqual(significantTerms('junção'));
    expect(significantTerms('relacionamentos')).toEqual(significantTerms('Relacionais'));
    expect(significantTerms('propriedades')).toEqual(significantTerms('propriedade'));
  });

  it('descarta rótulos de atividade (revisão, exercício, prática) e repete termo uma vez só', () => {
    expect(significantTerms('Revisão: exercício prático de JOIN e join')).toEqual(['join']);
  });
});

describe('requiredMatches', () => {
  it('1 ou 2 termos exigem todos; a partir de 3, a fração mínima arredondada para cima', () => {
    expect(COVERAGE).toBe(0.5);
    expect(requiredMatches(1, COVERAGE)).toBe(1);
    expect(requiredMatches(2, COVERAGE)).toBe(2);
    expect(requiredMatches(3, COVERAGE)).toBe(2);
    expect(requiredMatches(4, COVERAGE)).toBe(2);
    expect(requiredMatches(5, COVERAGE)).toBe(3);
  });
});

describe('stepTopicTerms', () => {
  it('usa o título da atividade; a descrição só quando o título não tem termo significativo', () => {
    expect(stepTopicTerms('INNER JOIN e LEFT JOIN na prática', 'Comparar resultados')).toEqual(['inner', 'join', 'left']);
    expect(stepTopicTerms('Revisão', 'Retomar normalização')).toEqual(significantTerms('Retomar normalização'));
  });
});

describe('isLexicallyRelevant (passos da aula demo)', () => {
  const step = (activity: string, chunk: { chapter: string; content: string }) =>
    isLexicallyRelevant(stepTopicTerms(activity, ''), `${chunk.chapter} ${chunk.content}`, COVERAGE);

  it('Revisão de chaves e relacionamentos casa com o Cap. 6 (chave + relacionais)', () => {
    expect(step('Revisão: chaves e relacionamentos', CAP6)).toBe(true);
  });

  it('INNER JOIN e LEFT JOIN casa com o Cap. 4', () => {
    expect(step('INNER JOIN e LEFT JOIN na prática', CAP4)).toBe(true);
  });

  it('propriedades ACID casa com o Cap. 8', () => {
    expect(step('Exercício relâmpago: propriedades ACID', CAP8)).toBe(true);
  });

  it('Subqueries e operações de conjunto NÃO casa com o trecho de JOIN do Cap. 4', () => {
    expect(step('Subqueries e operações de conjunto', CAP4)).toBe(false);
  });

  it('Intervalo não casa com nenhum trecho', () => {
    for (const c of [CAP4, CAP6, CAP8]) expect(step('Intervalo', c)).toBe(false);
  });

  it('sem termo significativo no tópico: não é relevante', () => {
    expect(isLexicallyRelevant([], CAP4.content, COVERAGE)).toBe(false);
  });

  it('com 3+ termos basta a fração mínima', () => {
    const terms = significantTerms('tuplas tabelas esquema transações');
    expect(isLexicallyRelevant(terms, CAP4.content, COVERAGE)).toBe(true); // tuplas, tabelas: 2 de 4
    expect(isLexicallyRelevant(terms, 'esquema apenas', COVERAGE)).toBe(false); // 1 de 4
  });
});
