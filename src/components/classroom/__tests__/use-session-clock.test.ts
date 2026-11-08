// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { deriveAgendaStatus } from '@/domains/agendas/agenda-validator';
import { MAX_TIMEOUT_MS, nextBoundaryDelay, useSessionClock } from '../use-session-clock';

const START = '2026-11-08T12:00:00.000Z';
const END = '2026-11-08T14:00:00.000Z';
const at = (iso: string) => new Date(iso).getTime();

describe('nextBoundaryDelay', () => {
  it('antes do início espera até startTime', () => {
    expect(nextBoundaryDelay(START, END, at('2026-11-08T11:00:00.000Z'))).toBe(3_600_000);
  });
  it('durante a aula espera até logo após endTime', () => {
    expect(nextBoundaryDelay(START, END, at('2026-11-08T13:00:00.000Z'))).toBe(3_600_001);
  });
  it('exatamente em endTime ainda espera 1 ms para cruzar o fim', () => {
    expect(nextBoundaryDelay(START, END, at(END))).toBe(1);
  });
  it('depois do fim devolve null', () => {
    expect(nextBoundaryDelay(START, END, at('2026-11-08T15:00:00.000Z'))).toBeNull();
  });
  it('início em 30 dias é limitado a MAX_TIMEOUT_MS', () => {
    const now = at(START) - 30 * 24 * 3_600_000;
    expect(nextBoundaryDelay(START, END, now)).toBe(MAX_TIMEOUT_MS);
  });
});

describe('useSessionClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T11:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('usa um único setTimeout, nenhum setInterval, e atualiza no limite', () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const { result } = renderHook(() => useSessionClock(START, END, 'RUNNING'));
    expect(result.current.toISOString()).toBe('2026-11-08T11:00:00.000Z');
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(3_600_000);
    });
    expect(result.current.toISOString()).toBe(START);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(7_200_001);
    });
    expect(result.current.getTime()).toBeGreaterThan(at(END));
    expect(deriveAgendaStatus({ status: 'SCHEDULED', startTime: START, endTime: END }, result.current)).toBe(
      'COMPLETED'
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(interval).not.toHaveBeenCalled();
  });

  it('mudar resetKey recalcula o horário', () => {
    const { result, rerender } = renderHook(({ k }) => useSessionClock(START, END, k), {
      initialProps: { k: 'NOT_STARTED' },
    });
    vi.setSystemTime(new Date('2026-11-08T11:30:00.000Z'));
    expect(result.current.toISOString()).toBe('2026-11-08T11:00:00.000Z');
    rerender({ k: 'RUNNING' });
    expect(result.current.toISOString()).toBe('2026-11-08T11:30:00.000Z');
  });
});
