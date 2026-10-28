import { describe, it, expect } from 'vitest';
import { formatRemaining } from '../duration';

describe('formatRemaining', () => {
  it('menos de 1 minuto', () => {
    expect(formatRemaining(0)).toBe('menos de 1 min');
    expect(formatRemaining(0.5)).toBe('menos de 1 min');
  });
  it('minutos', () => {
    expect(formatRemaining(1)).toBe('1 min');
    expect(formatRemaining(45)).toBe('45 min');
  });
  it('horas', () => {
    expect(formatRemaining(200)).toBe('3 h 20 min');
    expect(formatRemaining(180)).toBe('3 h');
  });
  it('dias', () => {
    expect(formatRemaining(5 * 1440 + 180)).toBe('5 dias e 3 h');
    expect(formatRemaining(1440 + 180)).toBe('1 dia e 3 h');
    expect(formatRemaining(5 * 1440)).toBe('5 dias');
    expect(formatRemaining(1440)).toBe('1 dia');
  });
  it('meses', () => {
    expect(formatRemaining(2 * 43200 + 5 * 1440)).toBe('2 meses e 5 dias');
    expect(formatRemaining(43200 + 1440)).toBe('1 mês e 1 dia');
    expect(formatRemaining(43200)).toBe('1 mês');
  });
});
