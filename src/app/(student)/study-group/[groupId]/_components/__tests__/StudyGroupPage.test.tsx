// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import StudyGroupPage from '../StudyGroupPage';

const mocks = vi.hoisted(() => ({
  agenda: null as Record<string, unknown> | null,
  hook: vi.fn(),
}));

vi.mock('@/components/agendas/use-agenda', () => ({
  useAgenda: () => ({ agenda: mocks.agenda, isLoading: false, error: null, notFound: false }),
}));
vi.mock('@/components/layout/use-current-user', () => ({
  useCurrentUser: () => ({ user: { id: 'u1', name: 'Ana' } }),
}));
vi.mock('@/components/study-group/use-study-group', () => ({
  useStudyGroupMessages: (...args: unknown[]) => {
    mocks.hook(...args);
    return { messages: [], isLoading: false, isSending: false, error: null, send: vi.fn() };
  },
}));

const HOUR = 3_600_000;
function agendaWith(status: string, startOffset: number, endOffset: number) {
  const now = Date.now();
  return {
    id: 'g1',
    title: 'Grupo',
    className: 'Turma',
    teacherName: 'Prof',
    type: 'STUDY_GROUP',
    status,
    startTime: new Date(now + startOffset).toISOString(),
    endTime: new Date(now + endOffset).toISOString(),
  };
}

describe('StudyGroupPage: checagem de silêncio', () => {
  beforeEach(() => {
    mocks.hook.mockClear();
  });

  it('habilita a checagem só quando a agenda está LIVE', () => {
    mocks.agenda = agendaWith('LIVE', -HOUR, HOUR);
    render(<StudyGroupPage groupId="g1" />);
    expect(mocks.hook.mock.calls.at(-1)?.[2]).toEqual({ stalemateEnabled: true });
  });

  it('não habilita com a aula encerrada pelo professor (COMPLETED), mesmo dentro do horário', () => {
    mocks.agenda = agendaWith('COMPLETED', -HOUR, HOUR);
    render(<StudyGroupPage groupId="g1" />);
    expect(mocks.hook.mock.calls.at(-1)?.[2]).toEqual({ stalemateEnabled: false });
  });

  it('não habilita quando a aula já passou do fim', () => {
    mocks.agenda = agendaWith('LIVE', -3 * HOUR, -HOUR);
    render(<StudyGroupPage groupId="g1" />);
    expect(mocks.hook.mock.calls.at(-1)?.[2]).toEqual({ stalemateEnabled: false });
  });
});
