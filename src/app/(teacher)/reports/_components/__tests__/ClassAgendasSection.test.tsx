// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ClassAgendasSection } from '../ClassAgendasSection';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';

vi.mock('@/components/agendas/agenda-actions', () => ({
  changeAgendaStatus: vi.fn(),
  generateClassMinutes: vi.fn(),
}));

afterEach(cleanup);

const agenda = (overrides: Partial<AgendaDTO> = {}): AgendaDTO => ({
  id: 'a1',
  title: 'Aula 1',
  subject: 'Matemática',
  type: 'CLASSROOM',
  status: 'LIVE',
  startTime: '2026-11-08T12:00:00.000Z',
  endTime: '2026-11-08T13:00:00.000Z',
  classId: 'c1',
  className: 'Turma A',
  teacherName: 'Prof',
  ...overrides,
});

const renderWith = (agendas: AgendaDTO[]) =>
  render(<ClassAgendasSection agendas={agendas} isLoading={false} error={null} onChanged={vi.fn()} />);

describe('ClassAgendasSection', () => {
  it('CLASSROOM ao vivo tem o link Conduzir aula para o painel', () => {
    renderWith([agenda({ id: 'a1', type: 'CLASSROOM', status: 'LIVE' })]);
    expect(screen.getByRole('link', { name: 'Conduzir aula' }).getAttribute('href')).toBe('/teacher/live/a1');
  });

  it('sem link para aula agendada ou encerrada e para outros tipos ao vivo', () => {
    renderWith([
      agenda({ id: 'a2', type: 'CLASSROOM', status: 'SCHEDULED' }),
      agenda({ id: 'a3', type: 'CLASSROOM', status: 'COMPLETED' }),
      agenda({ id: 'a4', type: 'STUDY_GROUP', status: 'LIVE' }),
    ]);
    expect(screen.queryByRole('link', { name: 'Conduzir aula' })).toBeNull();
  });
});
