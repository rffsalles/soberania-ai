// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { prepareSummary, usePrepareTutor } from '../use-prepare-tutor';

const ok = (stepIndex: number, status = 'READY') =>
  new Response(JSON.stringify({ success: true, step: { stepIndex, status, card: true, question: true, message: null } }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('usePrepareTutor', () => {
  it('posta um passo por vez, em sequência, e segue após erro', async () => {
    const resolvers: Array<() => void> = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const idx = JSON.parse(init!.body as string).stepIndex as number;
      return new Promise<Response>((resolve) => {
        resolvers.push(() =>
          resolve(idx === 1 ? new Response(JSON.stringify({ success: false, error: 'x' }), { status: 500 }) : ok(idx)),
        );
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePrepareTutor('l1'));
    let p: Promise<void>;
    act(() => {
      p = result.current.run(3);
    });
    act(() => {
      void result.current.run(3); // ignorado
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ stepIndex: 0 });
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(i + 1));
      await act(async () => resolvers[i]());
    }
    await act(async () => {
      await p;
    });
    expect(fetchMock.mock.calls.map((c) => JSON.parse(c[1]!.body as string))).toEqual([
      { stepIndex: 0 },
      { stepIndex: 1 },
      { stepIndex: 2 },
    ]);
    expect(result.current.running).toBe(false);
    expect(result.current.summary).toEqual([
      'Tutora preparada: 2 de 3 passos com conteúdo pronto.',
      'Passo 2: não foi possível preparar. x',
    ]);
  });

  it.each(['CLASS_ENDED', 'NO_AGENDA', 'LESSON_NOT_PUBLISHED'])(
    '409 %s de nível de aula para o laço e resume numa linha com a mensagem',
    async (code) => {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        const idx = JSON.parse(init!.body as string).stepIndex as number;
        if (idx === 0) return ok(0);
        return new Response(JSON.stringify({ success: false, error: 'A aula já foi encerrada.', details: { code } }), {
          status: 409,
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => usePrepareTutor('l1'));
      await act(async () => {
        await result.current.run(4);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current.summary).toEqual(['Tutora não preparada: A aula já foi encerrada.']);
    },
  );

  it('409 de passo (sem código de aula) segue para o próximo passo como ERROR', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const idx = JSON.parse(init!.body as string).stepIndex as number;
      if (idx === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Conflito.', details: { code: 'OUTRO' } }), {
          status: 409,
        });
      }
      return ok(idx);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePrepareTutor('l1'));
    await act(async () => {
      await result.current.run(2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.summary).toEqual([
      'Tutora preparada: 1 de 2 passos com conteúdo pronto.',
      'Passo 1: não foi possível preparar. Conflito.',
    ]);
  });
});

describe('prepareSummary', () => {
  it('ABORTED vira uma linha só com a mensagem', () => {
    expect(
      prepareSummary([
        { stepIndex: 0, status: 'READY', card: true, question: true, message: null },
        { status: 'ABORTED', message: 'A aula publicada não tem agenda.' },
      ]),
    ).toEqual(['Tutora não preparada: A aula publicada não tem agenda.']);
  });
  it('resume READY, BUSY e ERROR', () => {
    expect(
      prepareSummary([
        { stepIndex: 0, status: 'READY', card: true, question: true, message: null },
        { stepIndex: 1, status: 'BUSY', card: false, question: false, message: null },
        { stepIndex: 2, status: 'ERROR', message: null },
      ]),
    ).toEqual([
      'Tutora preparada: 1 de 3 passos com conteúdo pronto.',
      'Passo 2: em preparo por outra requisição; tente de novo em 1 minuto.',
      'Passo 3: não foi possível preparar.',
    ]);
  });
  it('FAILED usa a mensagem; MUTED e NO_MATERIAL têm texto próprio', () => {
    expect(
      prepareSummary([
        { stepIndex: 0, status: 'FAILED', card: false, question: false, message: 'Falhou X.' },
        { stepIndex: 1, status: 'MUTED', card: false, question: false, message: null },
        { stepIndex: 2, status: 'NO_MATERIAL', card: false, question: false, message: null },
      ]).slice(1),
    ).toEqual(['Passo 1: Falhou X.', 'Passo 2: tutora em silêncio.', 'Passo 3: sem trecho do material.']);
  });
});
