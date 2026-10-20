// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTutorChat, type ChatMessage } from '../use-tutor-chat';

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('useTutorChat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('monta a resposta a partir dos eventos token e finaliza no done', async () => {
    const done = {
      reply: 'Olá mundo',
      citations: ['[Ementa]'],
      blockedByExamGuardrail: false,
      fallback: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'event: token\ndata: {"token":"Olá "}\n\n',
        'event: token\ndata: {"token":"mundo"}\n\n',
        `event: done\ndata: ${JSON.stringify(done)}\n\n`,
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTutorChat({ agendaId: 'ag-1' }));
    await act(async () => {
      await result.current.send('O que é um JOIN?');
    });

    expect(result.current.messages.map((m) => m.text)).toEqual(['O que é um JOIN?', 'Olá mundo']);
    expect(result.current.messages[1].citation).toBe('[Ementa]');
    expect(result.current.isStreaming).toBe(false);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toMatchObject({ agendaId: 'ag-1', message: 'O que é um JOIN?', history: [] });
  });

  it('popula error quando o servidor responde 422', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false, error: 'Fora da janela.' }), { status: 422 })
        )
    );
    const { result } = renderHook(() => useTutorChat({ agendaId: 'ag-1' }));
    await act(async () => {
      await result.current.send('oi');
    });
    await waitFor(() => expect(result.current.error).toBe('Fora da janela.'));
  });

  it('não envia a saudação sintética no history', async () => {
    const greeting: ChatMessage[] = [
      { id: 'g', sender: 'teacher', text: 'Olá!', synthetic: true, timestamp: '10:00' },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(['event: done\ndata: {"reply":"ok","citations":[]}\n\n']));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useTutorChat({ agendaId: 'ag-1', initialMessages: greeting })
    );
    await act(async () => {
      await result.current.send('oi');
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).history).toEqual([]);
  });

  it('ignora um segundo envio enquanto o primeiro está em andamento', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn().mockImplementation(async () => {
      await gate;
      return sseResponse(['event: done\ndata: {"reply":"ok","citations":[]}\n\n']);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTutorChat({ agendaId: 'ag-1' }));
    await act(async () => {
      const first = result.current.send('a');
      void result.current.send('b');
      release();
      await first;
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mantém o composer livre em respostas não-OK diferentes de 422', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false, error: 'Falha interna.' }), { status: 500 })
        )
    );
    const { result } = renderHook(() => useTutorChat({ agendaId: 'ag-1' }));
    await act(async () => {
      await result.current.send('oi');
    });
    expect(result.current.error).toBeNull();
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.failed).toBe(true);
    expect(last.text).toBe('Falha interna.');
    expect(result.current.isStreaming).toBe(false);
  });

  it('marca como falha quando o stream termina sem done', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse(['event: token\ndata: {"token":"Ol"}\n\n']))
    );
    const { result } = renderHook(() => useTutorChat({ agendaId: 'ag-1' }));
    await act(async () => {
      await result.current.send('oi');
    });
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.failed).toBe(true);
    expect(last.text).toBe('A resposta foi interrompida. Tente novamente.');
  });

  it('aborta o fetch ao desmontar', async () => {
    let signal!: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        return new Promise(() => {});
      })
    );
    const { result, unmount } = renderHook(() => useTutorChat({ agendaId: 'ag-1' }));
    act(() => {
      void result.current.send('oi');
    });
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
