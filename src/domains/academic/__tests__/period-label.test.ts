import { describe, it, expect } from 'vitest';
import { formatPeriodName, suggestPeriodCode } from '../period-label';

describe('formatPeriodName', () => {
  it('semestral', () => {
    expect(formatPeriodName({ code: '2026.1', year: 2026, semester: 1, type: 'SEMESTER' })).toBe('2026.1 · 1º Semestre / 2026');
    expect(formatPeriodName({ code: '2026.2', year: 2026, semester: 2, type: 'SEMESTER' })).toBe('2026.2 · 2º Semestre / 2026');
  });
  it('trimestral', () => {
    expect(formatPeriodName({ code: '2026.T1', year: 2026, semester: 1, type: 'TERM' })).toBe('2026.T1 · 1º Trimestre / 2026');
  });
  it('anual ignora o semestre', () => {
    expect(formatPeriodName({ code: '2026.ANUAL', year: 2026, semester: null, type: 'ANNUAL' })).toBe('2026.ANUAL · Anual / 2026');
    expect(formatPeriodName({ code: '2026.ANUAL', year: 2026, semester: 2, type: 'ANNUAL' })).toBe('2026.ANUAL · Anual / 2026');
  });
  it('intensivo', () => {
    expect(formatPeriodName({ code: '2026.INT', year: 2026, semester: 2, type: 'INTENSIVE' })).toBe('2026.INT · Intensivo / 2026');
  });
  it('sem semestre omite o ordinal', () => {
    expect(formatPeriodName({ code: 'X', year: 2026, semester: null, type: 'SEMESTER' })).toBe('X · Semestre / 2026');
    expect(formatPeriodName({ code: 'X', year: 2026, semester: undefined, type: 'TERM' })).toBe('X · Trimestre / 2026');
  });
});

describe('suggestPeriodCode', () => {
  it('uma sugestão por tipo', () => {
    expect(suggestPeriodCode({ year: 2026, semester: 1, type: 'SEMESTER' })).toBe('2026.1');
    expect(suggestPeriodCode({ year: 2027, semester: 2, type: 'SEMESTER' })).toBe('2027.2');
    expect(suggestPeriodCode({ year: 2026, semester: 1, type: 'TERM' })).toBe('2026.T1');
    expect(suggestPeriodCode({ year: 2026, semester: null, type: 'ANNUAL' })).toBe('2026.ANUAL');
    expect(suggestPeriodCode({ year: 2026, semester: 2, type: 'INTENSIVE' })).toBe('2026.INT');
  });
  it('sem semestre cai para o ano', () => {
    expect(suggestPeriodCode({ year: 2026, semester: null, type: 'SEMESTER' })).toBe('2026');
    expect(suggestPeriodCode({ year: 2026, semester: undefined, type: 'TERM' })).toBe('2026');
  });
});
