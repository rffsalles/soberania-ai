// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ANSWER_ERROR, useTutorAnswers } from '../use-tutor-answers';

afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('useTutorAnswers', () => {
  it('envia para a rota da pergunta e guarda o resultado', async () => {
    const result = { wasCorrect: false, correctKey: 'C', rationale: 'porque' };
    const fetchMock = vi.fn(async () => json(201, { success: true, result }));
    vi.stubGlobal('fetch', fetchMock);
    const { result: hook } = renderHook(() => useTutorAnswers('a1'));
    await act(async () => {
      await hook.current.submit(4, { optionKey: 'B' });
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/agendas/a1/events/4/answer');
    expect(init.body).toBe(JSON.stringify({ optionKey: 'B' }));
    expect(hook.current.answers[4]).toEqual(result);
    expect(hook.current.pendingSeq).toBeNull();
  });
  it('200 com alreadyAnswered guarda o resultado da resposta gravada', async () => {
    const result = { wasCorrect: true, correctKey: 'B', rationale: 'ok', alreadyAnswered: true };
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { success: true, result })));
    const { result: hook } = renderHook(() => useTutorAnswers('a1'));
    await act(async () => {
      await hook.current.submit(4, { optionKey: 'B' });
    });
    expect(hook.current.answers[4]).toEqual(result);
    expect(hook.current.error).toBeNull();
  });
  it('erro usa a mensagem do corpo ou a padrão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { success: false, error: 'Fora da janela' })));
    const { result: hook } = renderHook(() => useTutorAnswers('a1'));
    await act(async () => {
      await hook.current.submit(4, { text: 'oi' });
    });
    expect(hook.current.error).toEqual({ seq: 4, message: 'Fora da janela' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
    await act(async () => {
      await hook.current.submit(4, { text: 'oi' });
    });
    expect(hook.current.error).toEqual({ seq: 4, message: ANSWER_ERROR });
  });
  it('dois submit no mesmo act chamam fetch uma vez', async () => {
    const fetchMock = vi.fn(async () => json(201, { success: true, result: { wasCorrect: null, correctKey: null, rationale: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const { result: hook } = renderHook(() => useTutorAnswers('a1'));
    await act(async () => {
      void hook.current.submit(4, { text: 'a' });
      void hook.current.submit(4, { text: 'a' });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
