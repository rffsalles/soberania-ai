// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { MessageDTO } from '@/domains/agendas/services/study-group-service';
import type { ClassEventDTO } from '@/domains/classroom/class-event-schema';
import { useStudyGroupMessages } from '../use-study-group';

let mockEvents: ClassEventDTO[] = [];
vi.mock('@/components/classroom/use-class-events', () => ({
  useClassEvents: () => ({ events: mockEvents, status: 'live', lastSeq: 0, state: {} }),
}));

function ev(seq: number, type: ClassEventDTO['type'] = 'GROUP_MESSAGE'): ClassEventDTO {
  return { seq, type, stepIndex: null, payload: { messageId: `m${seq}` }, createdBy: 'SYSTEM', createdAt: '2026-10-20T12:00:00.000Z' };
}

function msg(id: string, createdAt: string, over: Partial<MessageDTO> = {}): MessageDTO {
  return { id, agendaId: 'g1', authorId: 'u1', authorName: 'Ana', isAi: false, content: id, createdAt, ...over };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('useStudyGroupMessages', () => {
  beforeEach(() => {
    mockEvents = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('o POST não avança o cursor: mensagens de colegas anteriores à resposta da tutora chegam na recarga por evento', async () => {
    const getSince: (string | null)[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return json({
          success: true,
          message: msg('mine', '2026-10-20T12:00:01.000Z', { content: '@tutora oi' }),
          tutorReply: msg('tutor', '2026-10-20T12:00:09.000Z', { isAi: true, authorId: 'ai' }),
        });
      }
      const since = new URL(url, 'http://localhost').searchParams.get('since');
      getSince.push(since);
      if (!since) return json({ success: true, messages: [msg('m0', '2026-10-20T12:00:00.000Z')] });
      return json({
        success: true,
        messages: [
          msg('mine', '2026-10-20T12:00:01.000Z', { content: '@tutora oi' }),
          msg('colega', '2026-10-20T12:00:05.000Z', { authorId: 'u2', authorName: 'Bia' }),
          msg('tutor', '2026-10-20T12:00:09.000Z', { isAi: true, authorId: 'ai' }),
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender } = renderHook(() => useStudyGroupMessages('g1', { id: 'u1', name: 'Ana' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.send('@tutora oi');
    });
    mockEvents = [ev(5)];
    await act(async () => {
      rerender();
    });

    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toContain('colega'));
    expect(getSince[1]).toBe('2026-10-20T12:00:00.000Z');
    expect(result.current.messages.map((m) => m.id)).toEqual(['m0', 'mine', 'colega', 'tutor']);
  });

  const gets = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method !== 'POST');

  it('monta com 1 GET sem since; GROUP_MESSAGE novo recarrega com since; STEP_CHANGED não', async () => {
    const f = vi.fn(async () => json({ success: true, messages: [msg('m0', '2026-10-20T12:00:00.000Z')] }));
    vi.stubGlobal('fetch', f);
    const { result, rerender } = renderHook(() => useStudyGroupMessages('g1', { id: 'u1', name: 'Ana' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(gets(f)).toHaveLength(1);
    expect(String(gets(f)[0][0])).not.toContain('since');

    mockEvents = [ev(1, 'STEP_CHANGED')];
    await act(async () => rerender());
    expect(gets(f)).toHaveLength(1);

    mockEvents = [ev(1, 'STEP_CHANGED'), ev(5)];
    await act(async () => rerender());
    await waitFor(() => expect(gets(f)).toHaveLength(2));
    expect(decodeURIComponent(String(gets(f)[1][0]))).toContain('since=2026-10-20T12:00:00.000Z');
  });

  it('replay de GROUP_MESSAGE durante a primeira carga é só linha de base; evento novo depois recarrega', async () => {
    let release: (r: Response) => void = () => {};
    let n = 0;
    const f = vi.fn(() => {
      n += 1;
      if (n === 1) return new Promise<Response>((r) => (release = r));
      return Promise.resolve(json({ success: true, messages: [] }));
    });
    vi.stubGlobal('fetch', f);
    const { result, rerender } = renderHook(() => useStudyGroupMessages('g1', { id: 'u1', name: 'Ana' }));
    await act(async () => {
      await Promise.resolve();
    });

    mockEvents = [ev(1), ev(2), ev(3)];
    await act(async () => rerender());
    await act(async () => {
      release(json({ success: true, messages: [] }));
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(gets(f)).toHaveLength(1);

    mockEvents = [ev(1), ev(2), ev(3), ev(4)];
    await act(async () => rerender());
    await waitFor(() => expect(gets(f)).toHaveLength(2));
  });

  it('sem eventos e sem stalemateEnabled, o relógio não gera GET (sem polling)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = vi.fn(async () => json({ success: true, messages: [msg('m0', '2026-10-20T12:00:00.000Z')] }));
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useStudyGroupMessages('g1', { id: 'u1', name: 'Ana' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(gets(f)).toHaveLength(1);
  });

  it('evento durante carga em curso agenda exatamente mais 1 carga', async () => {
    let release: (r: Response) => void = () => {};
    let n = 0;
    const f = vi.fn(() => {
      n += 1;
      if (n === 2) return new Promise<Response>((r) => (release = r));
      return Promise.resolve(json({ success: true, messages: [] }));
    });
    vi.stubGlobal('fetch', f);
    const { result, rerender } = renderHook(() => useStudyGroupMessages('g1', { id: 'u1', name: 'Ana' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockEvents = [ev(4)];
    await act(async () => rerender());
    expect(f).toHaveBeenCalledTimes(2);
    mockEvents = [ev(4), ev(5)];
    await act(async () => rerender());
    mockEvents = [ev(4), ev(5), ev(6)];
    await act(async () => rerender());
    expect(f).toHaveBeenCalledTimes(2);
    await act(async () => {
      release(json({ success: true, messages: [] }));
    });
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3));
    await act(async () => {
      await Promise.resolve();
    });
    expect(f).toHaveBeenCalledTimes(3);
  });

  describe('temporizador de silêncio', () => {
    const T = Date.parse('2026-10-20T12:00:00.000Z');
    const setup = async (last: MessageDTO, enabled = true) => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      vi.setSystemTime(T + 1000);
      const f = vi.fn(async () => json({ success: true, messages: [last] }));
      vi.stubGlobal('fetch', f);
      renderHook(() => useStudyGroupMessages('g1', { id: 'u1', name: 'Ana' }, { stalemateEnabled: enabled }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(gets(f)).toHaveLength(1);
      return f;
    };
    const advanceTo = (t: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(t - Date.now());
      });

    it('checa após o prazo e repete a cada 60 s', async () => {
      const f = await setup(msg('m0', new Date(T).toISOString()));
      await advanceTo(T + 301_999);
      expect(gets(f)).toHaveLength(1);
      await advanceTo(T + 302_000);
      expect(gets(f)).toHaveLength(2);
      await advanceTo(T + 362_000);
      expect(gets(f)).toHaveLength(3);
    });

    it('desmontar cancela o temporizador: sem GET depois do prazo', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      vi.setSystemTime(T + 1000);
      const f = vi.fn(async () => json({ success: true, messages: [msg('m0', new Date(T).toISOString())] }));
      vi.stubGlobal('fetch', f);
      const { unmount } = renderHook(() =>
        useStudyGroupMessages('g1', { id: 'u1', name: 'Ana' }, { stalemateEnabled: true }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(gets(f)).toHaveLength(1);
      await advanceTo(T + 2000);
      unmount();
      await advanceTo(T + 302_000);
      expect(gets(f)).toHaveLength(1);
    });

    it('última mensagem da IA não arma temporizador', async () => {
      const f = await setup(msg('ai', new Date(T).toISOString(), { isAi: true, authorId: 'ai' }));
      await advanceTo(T + 700_000);
      expect(gets(f)).toHaveLength(1);
    });

    it('stalemateEnabled false não arma temporizador', async () => {
      const f = await setup(msg('m0', new Date(T).toISOString()), false);
      await advanceTo(T + 700_000);
      expect(gets(f)).toHaveLength(1);
    });
  });
});
