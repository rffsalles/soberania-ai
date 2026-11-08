// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PULSE_REFRESH_MS, useClassPulse } from '../use-class-pulse';

const entry = { seq: 3, stepIndex: 0, kind: 'OPEN', answered: 1, correct: null };
const okRes = () => new Response(JSON.stringify({ success: true, pulse: [entry] }), { status: 200 });

describe('useClassPulse', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn(async () => okRes());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lê na montagem e a cada reloadKey, sem setInterval', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const { result, rerender } = renderHook(({ k }) => useClassPulse('a1', k, false), { initialProps: { k: 1 } });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/agendas/a1/pulse');
    expect(result.current.pulse).toEqual([entry]);
    rerender({ k: 2 });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(spy).not.toHaveBeenCalled();
  });

  it('com pergunta aberta relê a cada 10 s e desmontar limpa o timer', async () => {
    const { unmount } = renderHook(() => useClassPulse('a1', 1, true));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULSE_REFRESH_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULSE_REFRESH_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('erro de rede mantém o último pulso', async () => {
    const { result, rerender } = renderHook(({ k }) => useClassPulse('a1', k, false), { initialProps: { k: 1 } });
    await act(async () => {});
    fetchMock.mockRejectedValue(new Error('x'));
    rerender({ k: 2 });
    await act(async () => {});
    expect(result.current.pulse).toEqual([entry]);
  });
});
