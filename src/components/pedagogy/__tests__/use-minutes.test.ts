// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeneratedMinute } from '../use-minutes';

// Objeto estável: o efeito do hook depende de `user`; um objeto novo por render reexecutaria o fetch sem fim.
const currentUser = { user: { id: 's1', name: 'Lucas', role: 'STUDENT', classId: 'c1' }, isLoading: false };
vi.mock('@/components/layout/use-current-user', () => ({ useCurrentUser: () => currentUser }));

const baseMinute = {
  id: 'old',
  agendaId: 'ag1',
  sessionTitle: 'Aula',
  studentId: 's1',
  studentName: 'Lucas',
  engagementScore: 10,
  hesitationIndex: 0,
  topicsMastered: [],
  topicsStruggled: [],
  totalQuestionsAsked: 1,
  socraticChallengesAnswered: 0,
  rawSummary: '',
  actionableAdvice: '',
  aiGenerated: false,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  subjectName: 'BD',
  className: 'Turma A',
};

function stubFetch(minute: typeof baseMinute) {
  const calls: { method: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body as string | undefined });
      return new Response(JSON.stringify({ success: true, minute }));
    })
  );
  return calls;
}

describe('useGeneratedMinute', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sempre faz POST com a agenda e usa a ata devolvida pelo servidor', async () => {
    const calls = stubFetch({ ...baseMinute, id: 'new', rawSummary: 'Resumo IA', aiGenerated: true });
    const { result } = renderHook(() => useGeneratedMinute('ag1', true));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(calls).toEqual([{ method: 'POST', body: JSON.stringify({ agendaId: 'ag1' }) }]);
    expect(result.current.minute?.id).toBe('new');
  });

  it('erro do servidor vira mensagem de erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'falhou' }), { status: 500 })));
    const { result } = renderHook(() => useGeneratedMinute('ag1', true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('falhou');
    expect(result.current.minute).toBeNull();
  });
});
