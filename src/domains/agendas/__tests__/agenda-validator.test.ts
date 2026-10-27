import { afterEach, describe, it, expect, vi } from 'vitest';
import { validateAgendaTimeWindow } from '../agenda-validator';
import type { AgendaSession } from '../types';

describe('Agendas Domain - Time Window Validation', () => {
  it('calcula os minutos restantes reais quando a sessão LIVE tem endTime válido', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const validation = validateAgendaTimeWindow(
      {
        id: 'live-real',
        title: 'Aula',
        subject: 'BD',
        type: 'CLASSROOM',
        status: 'LIVE',
        instructorName: 'Prof.',
        startTime: '2026-10-20T11:00:00Z',
        endTime: '2026-10-20T12:05:00Z',
      },
      now
    );
    expect(validation.isWithinWindow).toBe(true);
    expect(validation.minutesRemaining).toBe(5);
    expect(validation.message).toContain('5 minuto(s)');
  });

  it('nega acesso quando a sessão LIVE já passou do endTime', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const validation = validateAgendaTimeWindow(
      {
        id: 'live-expired',
        title: 'Aula',
        subject: 'BD',
        type: 'CLASSROOM',
        status: 'LIVE',
        instructorName: 'Prof.',
        startTime: '2026-10-20T11:00:00Z',
        endTime: '2026-10-20T11:59:00Z',
      },
      now
    );
    expect(validation.isWithinWindow).toBe(false);
    expect(validation.minutesRemaining).toBe(0);
    expect(validation.message).toContain('encerrada');
  });

  it('deve autorizar acesso quando a sessão está LIVE e dentro da janela', () => {
    const session: AgendaSession = {
      id: 'test-1',
      title: 'Aula de Teste',
      type: 'CLASSROOM',
      status: 'LIVE',
      subject: 'Banco de Dados',
      teacherResponsible: 'Prof. Carlos Eduardo',
      tutorSupport: 'Tutora Lucy',
      instructorName: 'Prof. Carlos Eduardo',
      startTime: '19:00',
      endTime: '20:30',
      authorizedWindowMinutes: 90,
      createdAt: new Date().toISOString(),
    };

    const validation = validateAgendaTimeWindow(session);
    expect(validation.isWithinWindow).toBe(true);
  });

  it('deve rejeitar acesso quando a sessão está CANCELLED', () => {
    const session: AgendaSession = {
      id: 'test-2',
      title: 'Aula Cancelada',
      type: 'EXAM',
      status: 'CANCELLED',
      subject: 'Engenharia de Software',
      teacherResponsible: 'Profª. Dra. Helena Salles',
      tutorSupport: 'Tutora Lucy',
      instructorName: 'Profª. Dra. Helena Salles',
      startTime: '08:00',
      endTime: '10:00',
      authorizedWindowMinutes: 120,
      createdAt: new Date().toISOString(),
    };

    const validation = validateAgendaTimeWindow(session);
    expect(validation.isWithinWindow).toBe(false);
    expect(validation.message).toContain('cancelada');
  });
});

describe('Agendas Domain - flag NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const make = (status: AgendaSession['status'], startTime: string, endTime: string): AgendaSession => ({
    id: 'flag',
    title: 'Aula',
    subject: 'BD',
    type: 'CLASSROOM',
    status,
    instructorName: 'Prof.',
    startTime,
    endTime,
  });
  const TEST_MESSAGE = 'Sessão liberada para testes: a janela de horário está sendo ignorada.';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('libera SCHEDULED com startTime no futuro', () => {
    vi.stubEnv('NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW', 'true');
    const v = validateAgendaTimeWindow(make('SCHEDULED', '2026-10-21T12:00:00Z', '2026-10-21T13:00:00Z'), now);
    expect(v.isWithinWindow).toBe(true);
    expect(v.message).toBe(TEST_MESSAGE);
  });

  it('libera SCHEDULED e LIVE com endTime no passado', () => {
    vi.stubEnv('NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW', 'true');
    for (const status of ['SCHEDULED', 'LIVE'] as const) {
      const v = validateAgendaTimeWindow(make(status, '2026-10-20T09:00:00Z', '2026-10-20T10:00:00Z'), now);
      expect(v.isWithinWindow).toBe(true);
      expect(v.minutesRemaining).toBe(0);
    }
  });

  it('CANCELLED continua bloqueada', () => {
    vi.stubEnv('NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW', 'true');
    const v = validateAgendaTimeWindow(make('CANCELLED', '2026-10-20T11:00:00Z', '2026-10-20T13:00:00Z'), now);
    expect(v.isWithinWindow).toBe(false);
    expect(v.message).toContain('cancelada');
  });

  it("com a flag em 'false' mantém o comportamento original", () => {
    vi.stubEnv('NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW', 'false');
    const v = validateAgendaTimeWindow(make('SCHEDULED', '2026-10-21T12:00:00Z', '2026-10-21T13:00:00Z'), now);
    expect(v.isWithinWindow).toBe(false);
  });
});
