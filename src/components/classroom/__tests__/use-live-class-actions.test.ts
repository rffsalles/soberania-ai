// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveClassActions, LIVE_ACTION_ERROR } from '../use-live-class-actions';

const okResponse = () =>
  new Response(JSON.stringify({ success: true, events: [{ seq: 4 }, { seq: 5 }] }), { status: 201 });

describe('useLiveClassActions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envia POST com o corpo do comando e devolve o maior seq em 201', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const { result } = renderHook(() => useLiveClassActions('a1'));
    let ok: number | null = null;
    await act(async () => {
      ok = await result.current.send({ type: 'STEP_CHANGED', stepIndex: 2 });
    });
    expect(ok).toBe(5);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/agendas/a1/events',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'STEP_CHANGED', stepIndex: 2 }),
      })
    );
  });

  it('pending fica com o tipo do comando enquanto a requisição está aberta', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const { result } = renderHook(() => useLiveClassActions('a1'));
    let p!: Promise<number | null>;
    act(() => {
      p = result.current.send({ type: 'SESSION_STARTED' });
    });
    expect(result.current.pending).toBe('SESSION_STARTED');
    await act(async () => {
      resolve(okResponse());
      await p;
    });
    expect(result.current.pending).toBeNull();
  });

  it('segundo send durante o pendente não chama fetch e devolve null', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const { result } = renderHook(() => useLiveClassActions('a1'));
    let first!: Promise<number | null>;
    let second: number | null = 0;
    await act(async () => {
      first = result.current.send({ type: 'SESSION_STARTED' });
      second = await result.current.send({ type: 'SESSION_ENDED' });
      resolve(okResponse());
      await first;
    });
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('em 409 expõe a mensagem da API', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'A aula já foi iniciada.' }), {
        status: 409,
      })
    );
    const { result } = renderHook(() => useLiveClassActions('a1'));
    let ok: number | null = 0;
    await act(async () => {
      ok = await result.current.send({ type: 'SESSION_STARTED' });
    });
    expect(ok).toBeNull();
    expect(result.current.error).toBe('A aula já foi iniciada.');
  });

  it('falha de rede usa a mensagem padrão', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    const { result } = renderHook(() => useLiveClassActions('a1'));
    let ok: number | null = 0;
    await act(async () => {
      ok = await result.current.send({ type: 'SESSION_STARTED' });
    });
    expect(ok).toBeNull();
    expect(result.current.error).toBe(LIVE_ACTION_ERROR);
    expect(result.current.pending).toBeNull();
  });

  it('error é limpo no próximo send bem-sucedido', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    fetchMock.mockResolvedValueOnce(okResponse());
    const { result } = renderHook(() => useLiveClassActions('a1'));
    await act(async () => {
      await result.current.send({ type: 'SESSION_STARTED' });
    });
    expect(result.current.error).toBe(LIVE_ACTION_ERROR);
    await act(async () => {
      await result.current.send({ type: 'SESSION_STARTED' });
    });
    expect(result.current.error).toBeNull();
  });

  it('clearError limpa a mensagem', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    const { result } = renderHook(() => useLiveClassActions('a1'));
    await act(async () => {
      await result.current.send({ type: 'SESSION_STARTED' });
    });
    expect(result.current.error).toBe(LIVE_ACTION_ERROR);
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
