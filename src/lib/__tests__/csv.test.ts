import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';

describe('toCsv', () => {
  it('prefixa BOM, usa ; e CRLF', () => {
    const csv = toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(csv).toBe('﻿a;b\r\n1;x\r\n2;y');
  });

  it('escapa ponto e vírgula, aspas e quebras de linha', () => {
    const csv = toCsv([{ nome: 'a;b', obs: 'diz "oi"', linha: 'x\ny' }]);
    expect(csv).toBe('﻿nome;obs;linha\r\n"a;b";"diz ""oi""";"x\ny"');
  });

  it('junta arrays com | e trata nulos como vazio', () => {
    const csv = toCsv([{ t: ['A', 'B'], n: null }]);
    expect(csv).toBe('﻿t;n\r\nA|B;');
  });

  it('retorna apenas BOM para lista vazia', () => {
    expect(toCsv([])).toBe('﻿');
  });
});
