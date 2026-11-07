import { describe, expect, it } from 'vitest';
import { toPlainText } from '../plain-text';

describe('toPlainText', () => {
  it('tira negrito, itálico e títulos', () => {
    expect(toPlainText('## Atomicidade\n**Tudo ou nada**: a transação é *indivisível*.')).toBe(
      'Atomicidade\nTudo ou nada: a transação é indivisível.'
    );
    expect(toPlainText('__Consistência__ vem depois.')).toBe('Consistência vem depois.');
  });

  it('troca marcadores de lista por linhas simples e numeração por "1)"', () => {
    expect(toPlainText('Propriedades:\n- Atomicidade\n* Consistência\n• Isolamento\n  + Durabilidade')).toBe(
      'Propriedades:\nAtomicidade\nConsistência\nIsolamento\nDurabilidade'
    );
    expect(toPlainText('1. Leia o enunciado\n2. Responda')).toBe('1) Leia o enunciado\n2) Responda');
  });

  it('remove citação em bloco, régua e cercas de código, mantendo o conteúdo', () => {
    expect(toPlainText('> Definição\n---\n```sql\nSELECT 1;\n```')).toBe('Definição\nSELECT 1;');
    expect(toPlainText('Use `LEFT JOIN` aqui.')).toBe('Use LEFT JOIN aqui.');
  });

  it('converte link em texto e tabela em linhas', () => {
    expect(toPlainText('Veja [a norma](https://exemplo.org).')).toBe('Veja a norma.');
    expect(toPlainText('| Busca | Custo |\n|---|---|\n| binária | O(log n) |')).toBe('Busca: Custo\nbinária: O(log n)');
  });

  it('converte LaTeX simples em notação de texto', () => {
    expect(toPlainText('O custo é \\(O(\\log n)\\) e $\\frac{n}{2}$ comparações, ou \\[n^{2}\\].')).toBe(
      'O custo é O(log n) e n/2 comparações, ou n².'
    );
    expect(toPlainText('$\\sqrt{x} \\times y \\leq 3$')).toBe('√x × y ≤ 3');
  });

  it('não mexe em texto simples, multiplicação com espaços, valores em reais ou identificadores', () => {
    const text = 'Se a = 2 * 3 e o preço é R$ 5, a coluna id_aluno fica igual. 1) Pense; 2) responda.';
    expect(toPlainText(text)).toBe(text);
  });

  it('colapsa linhas em branco repetidas', () => {
    expect(toPlainText('A\n\n\n\nB')).toBe('A\n\nB');
  });
});
