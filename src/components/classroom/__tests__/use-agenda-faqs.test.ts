// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgendaFaqs } from '../use-agenda-lesson';

describe('useAgendaFaqs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('busca na montagem e a cada mudança de reloadKey, sem setInterval', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const fetchMock = vi.fn().mockImplementation(
      async () => new Response(JSON.stringify({ success: true, faqs: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderHook(({ k }) => useAgendaFaqs('ag-1', k), { initialProps: { k: '0:0' } });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ k: '1:0' });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    rerender({ k: '1:0' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(interval).not.toHaveBeenCalled();
  });

  it('ignora resposta atrasada de uma chave anterior', async () => {
    let resolveFirst!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_u: string, init: { signal: AbortSignal }) => {
        return new Promise<Response>((resolve, reject) => {
          resolveFirst = resolve;
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, faqs: [{ id: 'novo' }] }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(({ k }) => useAgendaFaqs('ag-1', k), { initialProps: { k: '0:0' } });
    rerender({ k: '1:0' });
    await act(async () => {});
    resolveFirst(new Response(JSON.stringify({ success: true, faqs: [{ id: 'velho' }] }), { status: 200 }));
    await act(async () => {});
    expect(result.current.faqs).toEqual([{ id: 'novo' }]);
  });
});
