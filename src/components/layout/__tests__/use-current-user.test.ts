// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCurrentUser } from '../use-current-user';

const user = { id: 'u1', name: 'Ana', email: 'ana@x', role: 'STUDENT', enrollment: null };

describe('useCurrentUser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sinaliza carregamento quando `enabled` vira true depois da montagem', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(({ enabled }) => useCurrentUser(undefined, enabled), {
      initialProps: { enabled: false },
    });
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(new Response(JSON.stringify({ user }), { status: 200 }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user?.id).toBe('u1');
  });
});
