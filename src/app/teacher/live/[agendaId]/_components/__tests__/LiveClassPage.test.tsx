// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClassState } from '@/domains/classroom/class-state';

const mocks = vi.hoisted(() => ({
  state: null as unknown as ClassState,
  status: 'live' as 'live' | 'updating' | 'offline',
  lesson: null as unknown,
  type: 'CLASSROOM',
  lastSeq: 0,
  events: [] as unknown[],
  realPulse: false,
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
  useClassEvents: () => ({ events: mocks.events, status: mocks.status, lastSeq: mocks.lastSeq, state: mocks.state }),
}));

// Por padrão sem pulso; `mocks.realPulse` liga o hook real (fetch mockado) para testar a integração.
vi.mock('@/components/classroom/use-class-pulse', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/classroom/use-class-pulse')>();
  return {
    ...real,
    useClassPulse: (...args: Parameters<typeof real.useClassPulse>) =>
      mocks.realPulse ? real.useClassPulse(...args) : { pulse: [] },
  };
});

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
const ok = () => Promise.resolve({ ok: true, json: async () => ({ success: true, events: [] }) });

beforeEach(() => {
  mocks.state = base;
  mocks.status = 'live';
  mocks.type = 'CLASSROOM';
  mocks.lastSeq = 0;
  mocks.events = [];
  mocks.realPulse = false;
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
    expect(current.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(current);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com o painel travado, clicar em outro passo não grava e o foco permanece', async () => {
    mocks.state = running(1);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<LiveClassPage agendaId="a1" />);
    fireEvent.click(screen.getByRole('button', { name: /Subqueries/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const other = screen.getByRole('button', { name: /Revisão/ });
    expect(other.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(other);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('após o 201, mantém os controles travados até lastSeq alcançar o seq devolvido', async () => {
    mocks.state = running(1);
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true, events: [{ seq: 7 }] }) })
    );
    const view = render(<LiveClassPage agendaId="a1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Encerrar aula' }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole('button', { name: 'Próximo' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Subqueries/ }).getAttribute('aria-disabled')).toBe('true');
    mocks.state = running(2);
    mocks.lastSeq = 7;
    view.rerender(<LiveClassPage agendaId="a1" />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Encerrar aula' }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('libera os controles após 6 s mesmo sem o evento chegar', async () => {
    vi.useFakeTimers();
    try {
      mocks.state = running(1);
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => ({ success: true, events: [{ seq: 7 }] }) })
      );
      render(<LiveClassPage agendaId="a1" />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
      });
      expect((screen.getByRole('button', { name: 'Encerrar aula' }) as HTMLButtonElement).disabled).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6100);
      });
      expect((screen.getByRole('button', { name: 'Encerrar aula' }) as HTMLButtonElement).disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('o alerta some quando o estado da aula muda', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, json: async () => ({ success: false, error: 'A aula já foi iniciada.' }) })
    );
    const view = render(<LiveClassPage agendaId="a1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar aula' }));
    await screen.findByRole('alert');
    mocks.state = running(0);
    view.rerender(<LiveClassPage agendaId="a1" />);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
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

  it('indicador mostra Atualizando quando status é updating', () => {
    mocks.status = 'updating';
    render(<LiveClassPage agendaId="a1" />);
    expect(screen.getByRole('status').textContent).toContain('Atualizando');
  });

  it('mostra a coluna da tutora com a aula em andamento', () => {
    mocks.state = running(0);
    render(<LiveClassPage agendaId="a1" />);
    expect(screen.getByRole('region', { name: 'Tutora' })).toBeTruthy();
  });

  it('aviso do servidor aparece em role=status na fase ENDED', async () => {
    mocks.state = running(0);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, events: [], warning: 'As atas não foram geradas.' }),
      })
    );
    const { rerender } = render(<LiveClassPage agendaId="a1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar aula' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    mocks.state = { ...base, phase: 'ENDED' };
    rerender(<LiveClassPage agendaId="a1" />);
    await waitFor(() => {
      expect(screen.getAllByRole('status').map((e) => e.textContent)).toContain('As atas não foram geradas.');
    });
  });
});

describe('LiveClassPage com o pulso real', () => {
  it('pergunta publicada no passo: lê /pulse e mostra "1 resposta" na coluna da tutora', async () => {
    mocks.realPulse = true;
    mocks.state = running(0);
    mocks.lastSeq = 3;
    const at = '2026-11-08T10:00:00.000Z';
    mocks.events = [
      { seq: 1, type: 'SESSION_STARTED', stepIndex: null, payload: {}, createdBy: 'TEACHER', createdAt: at },
      {
        seq: 2,
        type: 'STEP_CHANGED',
        stepIndex: 0,
        payload: { activity: script[0].activity, timeRange: script[0].timeRange, fromStepIndex: null },
        createdBy: 'TEACHER',
        createdAt: at,
      },
      {
        seq: 3,
        type: 'TUTOR_QUESTION',
        stepIndex: 0,
        payload: { kind: 'OPEN', text: 'Por que usar FK?', origin: 'TEACHER' },
        createdBy: 'TUTOR',
        createdAt: at,
      },
    ];
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/pulse')
          ? {
              ok: true,
              json: async () => ({
                success: true,
                pulse: [{ seq: 3, stepIndex: 0, kind: 'OPEN', answered: 1, correct: null }],
              }),
            }
          : { ok: true, json: async () => ({ success: true, events: [] }) },
      ),
    );
    render(<LiveClassPage agendaId="a1" />);
    const panel = screen.getByRole('region', { name: 'Tutora' });
    await waitFor(() => expect(panel.textContent).toContain('1 resposta'));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/agendas/a1/pulse');
  });
});
