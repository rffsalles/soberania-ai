import { describe, it, expect } from 'vitest';
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
