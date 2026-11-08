// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ClassState } from '@/domains/classroom/class-state';

const mocks = vi.hoisted(() => ({ state: null as unknown as ClassState }));

vi.mock('@/components/agendas/use-agenda', () => ({
  useAgenda: () => ({
    agenda: {
      id: 'a1',
      title: 'Aula de SQL',
      className: 'Turma A',
      subject: 'Banco de Dados',
      teacherName: 'Profa. Ana',
      startTime: '2026-11-08T13:00:00.000Z',
      endTime: '2026-11-08T15:00:00.000Z',
      videoUrl: null,
    },
    isLoading: false,
    error: null,
    notFound: false,
  }),
}));
vi.mock('@/components/classroom/use-agenda-lesson', () => ({
  useAgendaLesson: () => ({
    lesson: {
      videoUrl: null,
      mediaType: 'NONE',
      timeScript: [
        { timeSeconds: 0, activity: 'Introdução a SQL' },
        { timeSeconds: 60, activity: 'INNER JOIN e LEFT JOIN na prática' },
        { timeSeconds: 120, activity: 'Subqueries e operações de conjunto' },
      ],
    },
    isLoading: false,
  }),
  useAgendaFaqs: () => ({ faqs: [], isLoading: false }),
}));
vi.mock('@/components/classroom/use-class-events', () => ({
  useClassEvents: () => ({ events: [], status: 'live', lastSeq: 0, state: mocks.state }),
}));
vi.mock('@/components/classroom/use-session-clock', () => ({
  useSessionClock: () => new Date('2026-11-08T14:00:00.000Z'),
}));
vi.mock('@/components/classroom/use-fill-viewport-height', () => ({ useFillViewportHeight: () => undefined }));
vi.mock('@/components/classroom/interactive-video-player', () => ({ InteractiveVideoPlayer: () => null }));
vi.mock('@/components/classroom/socratic-chat-panel', () => ({ SocraticChatPanel: () => null }));
vi.mock('@/components/classroom/dynamic-faq-accordion', () => ({ DynamicFaqAccordion: () => null }));
vi.mock('@/components/classroom/pedagogical-minutes-modal', () => ({ PedagogicalMinutesModal: () => null }));

import ClassroomPage from '../ClassroomPage';

const base: ClassState = {
  phase: 'NOT_STARTED',
  currentStepIndex: null,
  currentStepActivity: null,
  lessonMuted: false,
  tutorByStep: {},
};

beforeEach(() => {
  mocks.state = base;
});
afterEach(cleanup);

describe('ClassroomPage faixa Agora na aula', () => {
  it('fase RUNNING mostra a faixa com a activity do passo atual e não o roteiro', () => {
    mocks.state = {
      ...base,
      phase: 'RUNNING',
      currentStepIndex: 1,
      currentStepActivity: 'INNER JOIN e LEFT JOIN na prática',
    };
    render(<ClassroomPage sessionId="a1" />);
    expect(screen.getByTestId('now-in-class-strip').textContent).toContain('INNER JOIN e LEFT JOIN na prática');
    expect(screen.queryByText('Subqueries e operações de conjunto')).toBeNull();
  });
  it('fase NOT_STARTED não mostra a faixa', () => {
    render(<ClassroomPage sessionId="a1" />);
    expect(screen.queryByTestId('now-in-class-strip')).toBeNull();
  });
  it('fase ENDED esconde a faixa', () => {
    mocks.state = { ...base, phase: 'ENDED', currentStepIndex: 2, currentStepActivity: 'Subqueries' };
    render(<ClassroomPage sessionId="a1" />);
    expect(screen.queryByTestId('now-in-class-strip')).toBeNull();
  });
});
