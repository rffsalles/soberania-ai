import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { CHAT_HISTORY_PAGE } from '@/lib/constants/chat';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { listStudentChatHistory, type ChatHistoryDeps } from '../chat-history-service';

const student = { id: 'stu1', role: Role.STUDENT, classId: 'c1' };

function rec(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `i${i}`,
    questionText: `q${i}`,
    responseText: `a${i}`,
    ragSourceBook: 'Livro X' as string | null,
    ragSourcePage: 12 as number | null,
    guardrailBlocked: false,
    createdAt: new Date(2026, 9, 20, 10, i),
    ...over,
  };
}

function deps(records = [rec(2), rec(1)], getAgenda?: ChatHistoryDeps['getAgenda']): ChatHistoryDeps {
  return {
    getAgenda: getAgenda ?? vi.fn(async () => ({ id: 'ag1' }) as AgendaDTO),
    listRecent: vi.fn(async () => records),
  };
}

describe('listStudentChatHistory', () => {
  it('agenda fora do escopo propaga 404 e não lê interações', async () => {
    const d = deps([], vi.fn(async () => { throw new DomainError(404, 'Agenda não encontrada.'); }));
    await expect(listStudentChatHistory(student, 'ag1', d)).rejects.toMatchObject({ status: 404 });
    expect(d.listRecent).not.toHaveBeenCalled();
  });

  it('devolve em ordem cronológica com citação montada', async () => {
    const items = await listStudentChatHistory(student, 'ag1', deps());
    expect(items.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(items[0]).toMatchObject({
      question: 'q1',
      answer: 'a1',
      citation: '[Livro X · pág. 12]',
      guardrailBlocked: false,
    });
    expect(items[0].createdAt).toBe(new Date(2026, 9, 20, 10, 1).toISOString());
  });

  it('pede os últimos CHAT_HISTORY_PAGE do próprio aluno', async () => {
    const d = deps();
    await listStudentChatHistory(student, 'ag1', d);
    expect(d.listRecent).toHaveBeenCalledWith('ag1', 'stu1', CHAT_HISTORY_PAGE);
    expect(CHAT_HISTORY_PAGE).toBe(50);
  });

  it('citação: só livro sem página; null sem livro', async () => {
    const items = await listStudentChatHistory(
      student,
      'ag1',
      deps([rec(2, { ragSourceBook: null, ragSourcePage: null }), rec(1, { ragSourcePage: null })])
    );
    expect(items[0].citation).toBe('[Livro X]');
    expect(items[1].citation).toBeNull();
  });

  it('professor recebe lista vazia sem consultar interações', async () => {
    const d = deps();
    const items = await listStudentChatHistory({ id: 't1', role: Role.TEACHER, classId: null }, 'ag1', d);
    expect(items).toEqual([]);
    expect(d.listRecent).not.toHaveBeenCalled();
  });
});
