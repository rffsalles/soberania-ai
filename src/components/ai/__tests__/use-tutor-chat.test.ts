// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTutorChat } from '../use-tutor-chat';

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
});
