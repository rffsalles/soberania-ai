// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { MessageDTO } from '@/domains/agendas/services/study-group-service';
import { useStudyGroupMessages } from '../use-study-group';

function msg(id: string, createdAt: string, over: Partial<MessageDTO> = {}): MessageDTO {
  return { id, agendaId: 'g1', authorId: 'u1', authorName: 'Ana', isAi: false, content: id, createdAt, ...over };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('useStudyGroupMessages', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('o POST não avança o cursor: mensagens de colegas anteriores à resposta da tutora chegam no polling', async () => {
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
    const { result } = renderHook(() => useStudyGroupMessages('g1', { id: 'u1', name: 'Ana' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.send('@tutora oi');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toContain('colega'));
    expect(getSince[1]).toBe('2026-10-20T12:00:00.000Z');
    expect(result.current.messages.map((m) => m.id)).toEqual(['m0', 'mine', 'colega', 'tutor']);
  });
});
