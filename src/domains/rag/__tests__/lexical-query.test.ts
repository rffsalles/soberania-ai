import { describe, expect, it } from 'vitest';
import { buildLexicalOrQuery, LEXICAL_MAX_TERMS } from '../lexical-query';

describe('buildLexicalOrQuery', () => {
  it('une os termos com OR (|) em vez de exigir todos', () => {
    expect(buildLexicalOrQuery('Quais propriedades ACID garantem a integridade?')).toBe(
      'quais | propriedades | acid | garantem | integridade'
    );
  });

  it('descarta pontuação e operadores de tsquery vindos do usuário', () => {
    expect(buildLexicalOrQuery("O que é 3FN? (xy & y) | !z <-> 'w':*")).toBe('que | 3fn | xy');
  });

  it('remove termos repetidos sem diferenciar maiúsculas', () => {
    expect(buildLexicalOrQuery('Join JOIN join left')).toBe('join | left');
  });

  it('mantém acentos (combinados ou não) dentro da palavra', () => {
    expect(buildLexicalOrQuery('retenção conceitual')).toBe('retenção | conceitual');
  });

  it('separa palavras com hífen', () => {
    expect(buildLexicalOrQuery('Big-O não-chave')).toBe('big | não | chave');
  });

  it('descarta palavras de uma letra ("é", "a", "o"), que casam com quase todo trecho, mas mantém dígitos', async () => {
    expect(buildLexicalOrQuery('O que é a 2FN e a forma 3?')).toBe('que | 2fn | forma | 3');
  });

  it('limita a quantidade de termos', () => {
    const many = Array.from({ length: LEXICAL_MAX_TERMS + 10 }, (_, i) => `termo${i}`).join(' ');
    expect(buildLexicalOrQuery(many)!.split(' | ')).toHaveLength(LEXICAL_MAX_TERMS);
  });

  it('devolve null quando não há termo nenhum', () => {
    expect(buildLexicalOrQuery('  ?!... ')).toBeNull();
    expect(buildLexicalOrQuery('')).toBeNull();
  });
});
