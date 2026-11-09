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

  it('reduz plural: chaves = chave, junções = junção, transações = transação, propriedades = propriedade', () => {
    expect(significantTerms('chaves')).toEqual(significantTerms('chave'));
    expect(significantTerms('junções')).toEqual(significantTerms('junção'));
    expect(significantTerms('transações')).toEqual(significantTerms('transação'));
    expect(significantTerms('propriedades')).toEqual(significantTerms('propriedade'));
  });

  // Documentação executável do radical de 6 letras: erros conhecidos e aceitos.
  it('radical: normalização e normal colapsam (falso positivo aceito)', () => {
    expect(isLexicallyRelevant(significantTerms('normalização'), 'valor normal', COVERAGE)).toBe(true);
  });

  it('radical: índice e indexação não casam (falso negativo aceito)', () => {
    expect(isLexicallyRelevant(significantTerms('índice'), 'a indexação acelera consultas', COVERAGE)).toBe(false);
  });

  it('aceita sigla curta (toda maiúscula ou com dígito) com comparação exata', () => {
    expect(significantTerms('Introdução ao SQL')).toEqual(['sql']);
    expect(significantTerms('Da 2FN à 3FN')).toEqual(['2fn', '3fn']);
    expect(significantTerms('DER e UML')).toEqual(['der', 'uml']);
    // Palavra curta minúscula não é sigla; preposição em título todo maiúsculo também não.
    expect(significantTerms('uso de api')).toEqual([]);
    expect(significantTerms('MODELO DE DADOS')).toEqual(['modelo', 'dado']);
  });

  it('sigla casa no trecho sem diferenciar caixa; "SQL básico" não aprova trecho só por "básico"', () => {
    expect(isLexicallyRelevant(stepTopicTerms('Introdução ao SQL', ''), 'A linguagem SQL define tabelas.', COVERAGE)).toBe(true);
    expect(isLexicallyRelevant(stepTopicTerms('Introdução ao SQL', ''), 'a linguagem sql', COVERAGE)).toBe(true);
    expect(isLexicallyRelevant(stepTopicTerms('SQL básico', ''), 'Um exemplo básico de árvore.', COVERAGE)).toBe(false);
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

  it('sem termo no título nem na descrição, cai na consulta usada na busca', () => {
    expect(stepTopicTerms('Revisão', '', 'chave estrangeira')).toEqual(significantTerms('chave estrangeira'));
    expect(stepTopicTerms('Revisão geral', 'Pausa.', '')).toEqual([]);
  });

  it('rótulos de formato não viram tópico (intervalo, quiz, estudo de caso, dúvidas, fundamentos)', () => {
    expect(stepTopicTerms('Intervalo', '')).toEqual([]);
    expect(stepTopicTerms('Quiz: estudo de caso e dúvidas', '')).toEqual([]);
    expect(stepTopicTerms('Fundamentos: conceito geral, exemplos usando tipos', '')).toEqual([]);
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

  it('Revisão de chaves e relacionamentos (caso real do seed) casa com o Cap. 6 via título do capítulo', () => {
    // "relacionamentos" ~ "Relacionais" no título do capítulo; sem o título o trecho só cobre "chave".
    expect(isLexicallyRelevant(stepTopicTerms('Revisão: chaves e relacionamentos', ''), CAP6.content, COVERAGE)).toBe(false);
    expect(step('Revisão: chaves e relacionamentos', CAP6)).toBe(true);
  });

  it('Intervalo não casa com nenhum trecho, nem com "intervalo de confiança"', () => {
    for (const c of [CAP4, CAP6, CAP8]) expect(step('Intervalo', c)).toBe(false);
    const estat = { chapter: 'Capítulo 9: Estimação', content: 'O intervalo de confiança de 95% para a média.' };
    expect(step('Intervalo', estat)).toBe(false);
    const real = isLexicallyRelevant(stepTopicTerms('Intervalo', 'Pausa para café e alongamento.'), estat.content, COVERAGE);
    expect(real).toBe(false);
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
