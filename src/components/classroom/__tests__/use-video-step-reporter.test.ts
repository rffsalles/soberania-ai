// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoStepReporter } from '../use-video-step-reporter';

describe('useVideoStepReporter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('envia POST com videoSeconds e resolve true no 2xx', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    const { result } = renderHook(() => useVideoStepReporter('a1', true));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current(42);
    });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/agendas/a1/events/video-step',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ videoSeconds: 42 }) })
    );
  });
  it('enabled falso não faz fetch e resolve false', async () => {
    const { result } = renderHook(() => useVideoStepReporter('a1', false));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current(42);
    });
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('resposta não-OK diferente de 409: resolve false, avisa e segue reportando', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValue(new Response('{}', { status: 201 }));
    const { result } = renderHook(() => useVideoStepReporter('a1', true));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current(10);
    });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalledWith('video-step: resposta 500');
    await act(async () => {
      ok = await result.current(10);
    });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it('para no primeiro 409 sem avisar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(new Response('{}', { status: 409 }));
    const { result } = renderHook(() => useVideoStepReporter('a1', true));
    await act(async () => result.current(10));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    await act(async () => result.current(700));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('erro de rede só loga, resolve false e segue funcionando', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error('off')).mockResolvedValue(new Response('{}', { status: 201 }));
    const { result } = renderHook(() => useVideoStepReporter('a1', true));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current(10);
    });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    await act(async () => result.current(700));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
