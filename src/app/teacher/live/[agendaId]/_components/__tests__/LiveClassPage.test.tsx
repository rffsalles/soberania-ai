// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClassState } from '@/domains/classroom/class-state';

const mocks = vi.hoisted(() => ({
  state: null as unknown as ClassState,
  status: 'live' as 'live' | 'polling' | 'offline',
  lesson: null as unknown,
  type: 'CLASSROOM',
}));

vi.mock('@/components/agendas/use-agenda', () => ({
  useAgenda: () => ({
    agenda: {
      id: 'a1',
      type: mocks.type,
      title: 'Aula de SQL',
      className: 'Turma A',
      subject: 'Banco de Dados',
    },
    isLoading: false,
    error: null,
    notFound: false,
  }),
}));
vi.mock('@/components/classroom/use-agenda-lesson', () => ({
  useAgendaLesson: () => ({ lesson: mocks.lesson, isLoading: false }),
}));
vi.mock('@/components/classroom/use-class-events', () => ({
  useClassEvents: () => ({ events: [], status: mocks.status, lastSeq: 0, state: mocks.state }),
}));

import LiveClassPage from '../LiveClassPage';

const script = [
  { timeSeconds: 0, timeRange: '00:00 - 10:00', activity: 'Revisão: chaves e relacionamentos', description: 'Rever PK e FK' },
  { timeSeconds: 600, timeRange: '10:00 - 20:00', activity: 'INNER JOIN e LEFT JOIN na prática', description: 'Exercícios de junção' },
  { timeSeconds: 1200, timeRange: '20:00 - 30:00', activity: 'Subqueries e operações de conjunto', description: 'UNION e EXISTS' },
];
const base: ClassState = {
  phase: 'NOT_STARTED',
  currentStepIndex: null,
  currentStepActivity: null,
  lessonMuted: false,
  tutorByStep: {},
};

let fetchMock: ReturnType<typeof vi.fn>;
const ok = () => Promise.resolve({ ok: true, json: async () => ({ success: true }) });

beforeEach(() => {
  mocks.state = base;
  mocks.status = 'live';
  mocks.type = 'CLASSROOM';
  mocks.lesson = { videoUrl: null, mediaType: 'NONE', timeScript: script };
  fetchMock = vi.fn(ok);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const running = (i: number): ClassState => ({ ...base, phase: 'RUNNING', currentStepIndex: i, currentStepActivity: script[i].activity });
const body = (n = 0) => (fetchMock.mock.calls[n][1] as { body: string }).body;

describe('LiveClassPage', () => {
  it('NOT_STARTED: Iniciar aula grava SESSION_STARTED', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<LiveClassPage agendaId="a1" />);
    expect(screen.getByText('A turma verá o primeiro passo assim que você iniciar a aula.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar aula' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/agendas/a1/events',
      expect.objectContaining({ method: 'POST', body: '{"type":"SESSION_STARTED"}' })
    );
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Iniciando...' }) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('RUNNING no passo 2: destaque, Próximo, Anterior e clique no passo', async () => {
    mocks.state = running(1);
    render(<LiveClassPage agendaId="a1" />);
    expect(screen.getByRole('button', { name: /INNER JOIN/ }).getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('list', { name: 'Roteiro da aula' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(body(0)).toBe('{"type":"STEP_CHANGED","stepIndex":2}');
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(body(1)).toBe('{"type":"STEP_CHANGED","stepIndex":0}');
    fireEvent.click(screen.getByRole('button', { name: /Subqueries/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(body(2)).toBe('{"type":"STEP_CHANGED","stepIndex":2}');
  });

  it('clicar no passo atual não grava nada', () => {
    mocks.state = running(1);
    render(<LiveClassPage agendaId="a1" />);
    const current = screen.getByRole('button', { name: /INNER JOIN/ }) as HTMLButtonElement;
    expect(current.disabled).toBe(true);
    fireEvent.click(current);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('último passo desabilita Próximo; primeiro desabilita Anterior', () => {
    mocks.state = running(2);
    const { unmount } = render(<LiveClassPage agendaId="a1" />);
    expect((screen.getByRole('button', { name: 'Próximo' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(false);
    unmount();
    mocks.state = running(0);
    render(<LiveClassPage agendaId="a1" />);
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Próximo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('409 mostra a mensagem da API', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, json: async () => ({ success: false, error: 'A aula já foi iniciada.' }) })
    );
    render(<LiveClassPage agendaId="a1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar aula' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('A aula já foi iniciada.');
  });

  it('Encerrar aula cancelado na confirmação não grava', async () => {
    mocks.state = running(1);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LiveClassPage agendaId="a1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar aula' }));
    expect(confirmSpy).toHaveBeenCalledWith(
      'Encerrar a aula? A turma verá a aula como encerrada e as atas dos alunos serão geradas.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar aula' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(body(0)).toBe('{"type":"SESSION_ENDED"}');
  });

  it('fase ENDED mostra Aula encerrada e nenhum botão de ação', () => {
    mocks.state = { ...base, phase: 'ENDED' };
    render(<LiveClassPage agendaId="a1" />);
    expect(screen.getByText('Aula encerrada.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver relatórios' }).getAttribute('href')).toBe('/reports');
    expect(screen.queryByRole('button', { name: /Iniciar aula|Anterior|Próximo|Encerrar aula/ })).toBeNull();
  });

  it('sem plano de aula mostra o aviso e ainda permite iniciar', () => {
    mocks.lesson = null;
    render(<LiveClassPage agendaId="a1" />);
    expect(screen.getByText('Esta agenda não tem plano de aula vinculado.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Iniciar aula' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('roteiro vazio mostra o aviso e ainda permite encerrar', () => {
    mocks.lesson = { videoUrl: null, mediaType: 'NONE', timeScript: [] };
    mocks.state = running(0);
    render(<LiveClassPage agendaId="a1" />);
    expect(
      screen.getByText('Este plano de aula não tem roteiro. Você pode iniciar e encerrar a aula, mas não há passos para conduzir.')
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Encerrar aula' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('agenda que não é CLASSROOM não mostra controles', () => {
    mocks.type = 'EXAM';
    render(<LiveClassPage agendaId="a1" />);
    expect(screen.getByText('Só aulas podem ser conduzidas por esta tela.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('indicador mostra Atualizando quando status é polling', () => {
    mocks.status = 'polling';
    render(<LiveClassPage agendaId="a1" />);
    expect(screen.getByRole('status').textContent).toContain('Atualizando');
  });
});
