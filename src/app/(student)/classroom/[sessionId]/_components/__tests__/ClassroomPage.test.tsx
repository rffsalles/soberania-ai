// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ClassState } from '@/domains/classroom/class-state';
import type { ClassEventDTO } from '@/domains/classroom/class-event-schema';

const mocks = vi.hoisted(() => ({
  state: null as unknown as ClassState,
  events: [] as ClassEventDTO[],
  videoUrl: null as string | null,
  mediaType: 'NONE' as string,
  playerProps: null as null | { stepTimes?: number[]; onStepCross?: unknown },
  now: '2026-11-08T14:00:00.000Z',
}));

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
      videoUrl: mocks.videoUrl,
      mediaType: mocks.mediaType,
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
  useClassEvents: () => ({ events: mocks.events, status: 'live', lastSeq: 0, state: mocks.state }),
}));
vi.mock('@/components/classroom/use-session-clock', () => ({
  useSessionClock: () => new Date(mocks.now),
}));
vi.mock('@/components/classroom/use-fill-viewport-height', () => ({ useFillViewportHeight: () => undefined }));
vi.mock('@/components/classroom/interactive-video-player', () => ({
  InteractiveVideoPlayer: (props: { stepTimes?: number[]; onStepCross?: unknown }) => {
    mocks.playerProps = props;
    return null;
  },
}));
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

function ev(seq: number, type: ClassEventDTO['type'], stepIndex: number | null, payload: unknown = {}): ClassEventDTO {
  return { seq, type, stepIndex, payload, createdBy: 'TEACHER', createdAt: '2026-11-08T00:00:00.000Z' };
}
const stepEv = (seq: number, i: number, activity: string) =>
  ev(seq, 'STEP_CHANGED', i, { activity, timeRange: '', fromStepIndex: null });

beforeEach(() => {
  mocks.state = base;
  mocks.events = [];
  mocks.videoUrl = null;
  mocks.mediaType = 'NONE';
  mocks.playerProps = null;
  mocks.now = '2026-11-08T14:00:00.000Z';
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
    mocks.events = [ev(1, 'SESSION_STARTED', null), stepEv(2, 1, 'INNER JOIN e LEFT JOIN na prática')];
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
    mocks.events = [ev(1, 'SESSION_STARTED', null), stepEv(2, 2, 'Subqueries'), ev(3, 'SESSION_ENDED', null)];
    render(<ClassroomPage sessionId="a1" />);
    expect(screen.queryByTestId('now-in-class-strip')).toBeNull();
  });
  it('cartão da tutora no passo atual aparece na faixa', () => {
    mocks.state = { ...base, phase: 'RUNNING', currentStepIndex: 1, currentStepActivity: 'JOINs' };
    mocks.events = [
      ev(1, 'SESSION_STARTED', null),
      stepEv(2, 1, 'JOINs'),
      ev(3, 'TUTOR_CARD', 1, {
        concepts: [
          { title: 'LEFT JOIN', explanation: 'e1', citation: { chunkId: 'c', label: 'Livro', page: 1 } },
          { title: 'INNER JOIN', explanation: 'e2', citation: { chunkId: 'd', label: 'Livro', page: null } },
        ],
        objectiveLink: 'obj',
        source: 'GENERATED',
      }),
    ];
    render(<ClassroomPage sessionId="a1" />);
    expect(screen.getByTestId('now-in-class-strip').textContent).toContain('LEFT JOIN');
  });
});

describe('ClassroomPage aula gravada', () => {
  it('NOT_STARTED com vídeo e roteiro, depois do fim da janela, passa onStepCross e stepTimes', () => {
    mocks.videoUrl = 'https://youtu.be/abcdefghijk';
    mocks.mediaType = 'YOUTUBE';
    mocks.now = '2026-11-08T15:00:00.001Z';
    render(<ClassroomPage sessionId="a1" />);
    expect(typeof mocks.playerProps?.onStepCross).toBe('function');
    expect(mocks.playerProps?.stepTimes).toEqual([0, 60, 120]);
  });
  it.each(['2026-11-08T12:00:00.000Z', '2026-11-08T14:00:00.000Z', '2026-11-08T15:00:00.000Z'])(
    'NOT_STARTED com vídeo antes do fim da janela (%s): onStepCross indefinido',
    (now) => {
      mocks.videoUrl = 'https://youtu.be/abcdefghijk';
      mocks.mediaType = 'YOUTUBE';
      mocks.now = now;
      render(<ClassroomPage sessionId="a1" />);
      expect(mocks.playerProps?.onStepCross).toBeUndefined();
    },
  );
  it('sem vídeo onStepCross é indefinido', () => {
    render(<ClassroomPage sessionId="a1" />);
    expect(mocks.playerProps?.onStepCross).toBeUndefined();
  });
  it('fase RUNNING passa onStepCross indefinido', () => {
    mocks.videoUrl = 'https://youtu.be/abcdefghijk';
    mocks.mediaType = 'YOUTUBE';
    mocks.now = '2026-11-08T16:00:00.000Z';
    mocks.state = { ...base, phase: 'RUNNING', currentStepIndex: 0, currentStepActivity: 'x' };
    render(<ClassroomPage sessionId="a1" />);
    expect(mocks.playerProps?.onStepCross).toBeUndefined();
  });
});
