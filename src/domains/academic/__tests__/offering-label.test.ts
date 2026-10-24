import { describe, it, expect } from 'vitest';
import { formatOfferingLabel } from '../offering-label';

const base = {
  discipline: { code: 'BD101', name: 'Banco de Dados I' },
  class: { semester: 3, course: { code: 'ADS', academicLevel: 'HIGHER_EDUCATION' }, academicPeriod: { code: '2026.1' } },
};

describe('formatOfferingLabel', () => {
  it('superior usa "Sem"', () => {
    expect(formatOfferingLabel(base)).toBe('BD101 · Banco de Dados I · 3º Sem ADS · 2026.1');
  });
  it('ensino médio usa "Ano"', () => {
    expect(formatOfferingLabel({ ...base, class: { ...base.class, course: { code: 'EM', academicLevel: 'HIGH_SCHOOL' } } }))
      .toBe('BD101 · Banco de Dados I · 3º Ano EM · 2026.1');
  });
  it('ensino fundamental usa "Ano"', () => {
    expect(formatOfferingLabel({ ...base, class: { ...base.class, semester: 9, course: { code: 'EF', academicLevel: 'ELEMENTARY' } } }))
      .toBe('BD101 · Banco de Dados I · 9º Ano EF · 2026.1');
  });
  it('nível desconhecido cai em "Sem"', () => {
    expect(formatOfferingLabel({ ...base, class: { ...base.class, course: { code: 'X', academicLevel: 'OUTRO' } } }))
      .toBe('BD101 · Banco de Dados I · 3º Sem X · 2026.1');
  });
});
