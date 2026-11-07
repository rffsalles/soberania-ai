import { describe, expect, it } from 'vitest';
import { stripUnsupportedReferences, type CitationSource } from '../citation-guard';

const cap4: CitationSource = { chapter: 'Capítulo 4: Álgebra Relacional e SQL', pageNumber: 58 };
const art7: CitationSource = { chapter: 'Artigo 7º: Práticas de Ensino', pageNumber: 12 };
const capAbrev: CitationSource = { chapter: 'Cap. 2: ER', pageNumber: 31 };

describe('stripUnsupportedReferences', () => {
  it('sem trechos recuperados, troca referência inline inventada por indicação neutra', () => {
    const r = stripUnsupportedReferences(
      'A busca linear é descrita no Capítulo 3, página 45 do material adotado pelo professor. Ela percorre o vetor.',
      []
    );
    expect(r.text).toBe('A busca linear é descrita no material. Ela percorre o vetor.');
    expect(r.removed).toEqual(['Capítulo 3, página 45']);
  });

  it('remove referência inventada entre parênteses', () => {
    const r = stripUnsupportedReferences('A clorofila absorve luz solar (Capítulo 4, página 78). Depois vem o ATP.', []);
    expect(r.text).toBe('A clorofila absorve luz solar. Depois vem o ATP.');
  });

  it('remove citação entre colchetes inventada, inclusive o modelo literal do prompt', () => {
    expect(stripUnsupportedReferences('Isso está no livro [Banco de Dados · Cap. 9, pág. 200].', [cap4]).text).toBe(
      'Isso está no livro.'
    );
    expect(stripUnsupportedReferences('Veja [Livro Didático · Cap. X, pág. Y] e reflita.', []).text).toBe('Veja e reflita.');
  });

  it('referência no fim da frase sem preposição de lugar some sem deixar resto', () => {
    expect(stripUnsupportedReferences('A definição formal aparece no Capítulo 3, pág. 45.', []).text).toBe(
      'A definição formal aparece no material.'
    );
  });

  it('preserva citação real (capítulo e página do trecho recuperado)', () => {
    const text = 'O LEFT JOIN preserva a tabela à esquerda (Capítulo 4, página 58). Veja [Sistemas de Banco de Dados · Capítulo 4, pág. 58].';
    const r = stripUnsupportedReferences(text, [cap4]);
    expect(r.text).toBe(text);
    expect(r.removed).toEqual([]);
  });

  it('aceita abreviações e artigos numerados que vieram dos trechos', () => {
    const text = 'Releia o Cap. 2, p. 31 e o Artigo 7º, pág. 12.';
    expect(stripUnsupportedReferences(text, [capAbrev, art7]).text).toBe(text);
  });

  it('capítulo certo com página que não veio do trecho conta como inventada', () => {
    const r = stripUnsupportedReferences('Está no Capítulo 4, página 99.', [cap4]);
    expect(r.text).toBe('Está no material.');
  });

  it('mantém a real e troca só a inventada quando as duas aparecem', () => {
    const r = stripUnsupportedReferences('Compare o Capítulo 4, página 58 com o Capítulo 7, página 140.', [cap4]);
    expect(r.text).toBe('Compare o Capítulo 4, página 58 com o material.');
    expect(r.removed).toEqual(['Capítulo 7, página 140']);
  });

  it('referência no início da frase vira "O material"', () => {
    expect(stripUnsupportedReferences('Capítulo 3 explica a busca binária.', []).text).toBe('O material explica a busca binária.');
  });

  it('mantém a maiúscula da preposição no início da frase', () => {
    expect(stripUnsupportedReferences('Na página 45 há um exemplo.', []).text).toBe('No material há um exemplo.');
  });

  it('deixa intacto texto sem referências numeradas', () => {
    const text =
      'Pense, p. ex., no capítulo sobre transações: o artigo discute isolamento. Qual página do seu caderno tem isso? Em 2 passos: 1) leia; 2) responda.';
    const r = stripUnsupportedReferences(text, []);
    expect(r.text).toBe(text);
    expect(r.removed).toEqual([]);
  });

  it('página isolada inventada também sai', () => {
    expect(stripUnsupportedReferences('Isso aparece na página 45 do livro.', [cap4]).text).toBe('Isso aparece no material.');
  });

  it('trecho sintético não tem página: "pág." citada para ele é inventada', () => {
    const r = stripUnsupportedReferences('Veja a pág. 2.', [{ chapter: 'Trecho 2', pageNumber: 2 }]);
    expect(r.text).toBe('Veja o material.');
  });

  it('tira o marcador interno [FONTE: ...] que o modelo copia do prompt, mantendo a citação', () => {
    const r = stripUnsupportedReferences('Veja [FONTE: [Sistemas · Capítulo 4, pág. 58]].', [cap4]);
    expect(r.text).toBe('Veja [Sistemas · Capítulo 4, pág. 58].');
  });
});
