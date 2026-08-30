import { describe, it, expect } from 'vitest';
import { validateAgendaTimeWindow } from '../agenda-validator';
import type { AgendaSession } from '../types';

describe('Agendas Domain - Time Window Validation', () => {
  it('deve autorizar acesso quando a sessão está LIVE e dentro da janela', () => {
    const session: AgendaSession = {
      id: 'test-1',
      title: 'Aula de Teste',
      type: 'CLASSROOM',
      status: 'LIVE',
      subject: 'Banco de Dados',
      instructorName: 'Prof. Luci',
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
      instructorName: 'Prof. Luci',
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
