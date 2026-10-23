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
  subjectName: 'BD',
  className: 'Turma A',
};

function stubFetch(existing: typeof baseMinute | null) {
  const calls: { method: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method });
      if (method === 'GET') return new Response(JSON.stringify({ success: true, minutes: existing ? [existing] : [] }));
      return new Response(
        JSON.stringify({ success: true, minute: { ...baseMinute, id: 'new', rawSummary: 'Resumo IA', aiGenerated: true } })
      );
    })
  );
  return calls;
}

describe('useGeneratedMinute', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ata existente sem parecer (aiGenerated false) dispara nova geração', async () => {
    const calls = stubFetch(baseMinute);
    const { result } = renderHook(() => useGeneratedMinute('ag1', true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
    expect(result.current.minute?.id).toBe('new');
    expect(result.current.minute?.aiGenerated).toBe(true);
  });

  it('ata existente com parecer não dispara nova geração', async () => {
    const calls = stubFetch({ ...baseMinute, rawSummary: 'ok', aiGenerated: true });
    const { result } = renderHook(() => useGeneratedMinute('ag1', true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(calls.map((c) => c.method)).toEqual(['GET']);
    expect(result.current.minute?.id).toBe('old');
  });
});
