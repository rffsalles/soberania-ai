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

  it('envia POST com videoSeconds', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    const { result } = renderHook(() => useVideoStepReporter('a1', true));
    await act(async () => result.current(42));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/agendas/a1/events/video-step',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ videoSeconds: 42 }) })
    );
  });
  it('enabled falso não faz fetch', async () => {
    const { result } = renderHook(() => useVideoStepReporter('a1', false));
    await act(async () => result.current(42));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('para no primeiro 409', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 409 }));
    const { result } = renderHook(() => useVideoStepReporter('a1', true));
    await act(async () => result.current(10));
    await act(async () => result.current(700));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('erro de rede só loga e segue funcionando', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error('off')).mockResolvedValue(new Response('{}', { status: 201 }));
    const { result } = renderHook(() => useVideoStepReporter('a1', true));
    await act(async () => result.current(10));
    expect(warn).toHaveBeenCalled();
    await act(async () => result.current(700));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
