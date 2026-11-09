import { describe, expect, it } from 'vitest';
import { isStalemateDue, nextStalemateCheckAt, stalemateDueAt } from '../study-group-stalemate';

const T = new Date('2026-10-20T12:00:00Z').getTime();
const human = { authorId: 'u1', isAi: false, createdAt: new Date(T) };

describe('study-group-stalemate', () => {
  it('prazo do autor é 5 min; não autor espera mais 60 s', () => {
    expect(stalemateDueAt(human, 'u1')).toBe(T + 300_000);
    expect(stalemateDueAt(human, 'u2')).toBe(T + 360_000);
  });

  it('mensagem da IA não tem prazo', () => {
    const ai = { authorId: null, isAi: true, createdAt: new Date(T) };
    expect(stalemateDueAt(ai, 'u1')).toBeNull();
    expect(isStalemateDue(ai, 'u1', T + 10_000_000)).toBe(false);
    expect(nextStalemateCheckAt(ai, 'u1', T)).toBeNull();
  });

  it('isStalemateDue é estrito no prazo', () => {
    expect(isStalemateDue(human, 'u1', T + 300_000)).toBe(false);
    expect(isStalemateDue(human, 'u1', T + 300_001)).toBe(true);
  });

  it('nextStalemateCheckAt agenda após o prazo ou na nova tentativa', () => {
    expect(nextStalemateCheckAt(human, 'u1', T)).toBe(T + 302_000);
    expect(nextStalemateCheckAt(human, 'u1', T + 400_000)).toBe(T + 460_000);
  });

  it('createdAt como string ISO dá o mesmo resultado', () => {
    const iso = { ...human, createdAt: new Date(T).toISOString() };
    expect(stalemateDueAt(iso, 'u1')).toBe(T + 300_000);
    expect(stalemateDueAt(iso, 'u2')).toBe(T + 360_000);
  });
});
