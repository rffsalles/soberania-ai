import { describe, expect, it } from 'vitest';
import { attachmentDisposition } from '../content-disposition';

describe('attachmentDisposition', () => {
  it('nome com travessão gera filename* UTF-8 e fallback ASCII', () => {
    const header = attachmentDisposition('Relatório — Aula 1.pdf');
    expect(header).toBe(
      `attachment; filename="Relatorio _ Aula 1.pdf"; filename*=UTF-8''Relat%C3%B3rio%20%E2%80%94%20Aula%201.pdf`
    );
    expect(() => new Headers({ 'Content-Disposition': header })).not.toThrow();
  });

  it('remove aspas e barras invertidas do fallback e codifica caracteres reservados', () => {
    expect(attachmentDisposition(`a"b\\c'(1).txt`)).toBe(
      `attachment; filename="a_b_c'(1).txt"; filename*=UTF-8''a%22b%5Cc%27%281%29.txt`
    );
  });
});
