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
});
