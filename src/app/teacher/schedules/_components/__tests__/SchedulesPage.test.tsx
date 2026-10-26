// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const SCHEDULE = { id: 'sch-9', teachingPlanId: 'plan-2', startDate: '2026-02-01T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z', totalClasses: 20, startTime: '19:00', holidays: null };
const useSchedules = vi.fn((planId: string | null) => ({
  schedules: planId === 'plan-2' ? [SCHEDULE] : [], isLoading: false, error: null, reload: vi.fn(),
}));
const plans = [
  {
    id: 'plan-1',
    subject: {
      id: 's1', classId: 'c1',
      discipline: { name: 'Banco de Dados I', code: 'BD1' },
      class: {
        id: 'c1', name: 'Turma A',
        course: { name: 'Análise e Desenvolvimento de Sistemas' },
        academicPeriod: { name: '2026.1 · 1º Semestre / 2026' },
      },
    },
    syllabus: '', unitsContent: [], totalHours: 60, theoryHours: 40, practiceHours: 20,
  },
  {
    id: 'plan-2',
    subject: {
      id: 's2', classId: 'c2',
      discipline: { name: 'Física', code: 'FIS' },
      class: { id: 'c2', name: '2º Ano B', course: { name: 'Ensino Médio' }, academicPeriod: { name: '2025.2 · 2º Semestre / 2025' } },
    },
    syllabus: '', unitsContent: [], totalHours: 80,
  },
  {
    id: 'plan-3',
    subject: { id: 's3', classId: 'c3', discipline: { name: 'Ética', code: 'ETI' }, class: { id: 'c3', name: 'Turma C' } },
    syllabus: '', unitsContent: [],
  },
];

vi.mock('@/components/assessments/use-assessments', () => ({
  useTeacherPlans: () => ({ plans, isLoading: false, error: null, reload: lessonsState.reloadPlans }),
}));
const lessonsState = vi.hoisted(() => ({ lessons: [] as unknown[], reloadLessons: vi.fn(), distributeChapters: vi.fn(), generatePlanUnits: vi.fn(), reloadPlans: vi.fn(), books: [] as unknown[] }));
vi.mock('@/components/teaching/use-schedules', () => ({
  useSchedules: (id: string | null) => useSchedules(id),
  useScheduleLessons: () => ({ lessons: lessonsState.lessons, reload: lessonsState.reloadLessons }),
  syncSchedule: vi.fn(),
  distributeChapters: (id: string) => lessonsState.distributeChapters(id),
  generatePlanUnits: (id: string) => lessonsState.generatePlanUnits(id),
}));
vi.mock('@/components/teaching/use-plan-chapters', () => ({
  usePlanChapters: () => ({ books: lessonsState.books, isLoading: false, error: null, reload: vi.fn() }),
}));
vi.mock('../ScheduleForm', () => ({ ScheduleForm: () => null }));

import { SchedulesPage } from '../SchedulesPage';

afterEach(() => {
  cleanup();
  useSchedules.mockClear();
  vi.restoreAllMocks();
  lessonsState.lessons = [];
  lessonsState.books = [];
  lessonsState.reloadLessons.mockClear();
  lessonsState.distributeChapters.mockReset();
  lessonsState.generatePlanUnits.mockReset();
  lessonsState.reloadPlans.mockClear();
  plans[1].unitsContent = [];
});

function open() {
  render(<SchedulesPage />);
  fireEvent.click(screen.getByRole('combobox', { name: /plano de ensino/i }));
}

describe('SchedulesPage seletor de plano', () => {
  it('mostra título, subtítulo e carga horária de cada plano', () => {
    open();
    expect(screen.getByText('BD1 · Banco de Dados I')).toBeTruthy();
    expect(screen.getByText('Análise e Desenvolvimento de Sistemas · Turma A · 2026.1 · 1º Semestre / 2026')).toBeTruthy();
    expect(screen.getByText('60h (40T/20P)')).toBeTruthy();
    expect(screen.getByText('80h')).toBeTruthy();
    expect(screen.getByText('ETI · Ética')).toBeTruthy();
    expect(screen.getByText('Turma C')).toBeTruthy();
  });

  it('a busca filtra por curso e por período', () => {
    open();
    const search = screen.getByLabelText('Buscar por disciplina, curso, turma ou período...');
    fireEvent.change(search, { target: { value: 'ensino médio' } });
    expect(screen.queryByText('BD1 · Banco de Dados I')).toBeNull();
    expect(screen.getByText('FIS · Física')).toBeTruthy();
    fireEvent.change(search, { target: { value: '2026.1' } });
    expect(screen.getByText('BD1 · Banco de Dados I')).toBeTruthy();
    expect(screen.queryByText('FIS · Física')).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum plano encontrado.')).toBeTruthy();
  });

  it('selecionar um plano carrega os cronogramas dele', () => {
    open();
    fireEvent.click(screen.getByText('FIS · Física'));
    expect(useSchedules).toHaveBeenLastCalledWith('plan-2');
    expect(screen.getByText('Cronogramas')).toBeTruthy();
  });

  it('o link para planos de aula leva planId e scheduleId', () => {
    open();
    fireEvent.click(screen.getByText('FIS · Física'));
    fireEvent.click(screen.getByRole('button', { name: /20 aulas/ }));
    const href = screen.getByRole('link', { name: /Ir para planos de aula/ }).getAttribute('href') ?? '';
    expect(href).toContain('planId=plan-2');
    expect(href).toContain('scheduleId=sch-9');
  });
});

const BOOKS = [{ materialId: 'm1', title: 'Livro', author: 'A', kind: 'BASIC', chapters: [{ id: 'ch3', order: 3, title: 'C3', startPage: 1, endPage: 2 }] }];
const DISTRIBUTE = /Distribuir capítulos com IA/;

function openSchedule() {
  open();
  fireEvent.click(screen.getByText('FIS · Física'));
  fireEvent.click(screen.getByRole('button', { name: /20 aulas/ }));
}

describe('SchedulesPage distribuição de capítulos', () => {
  it('distribuir fica bloqueado sem aulas sincronizadas e mostra o motivo', () => {
    lessonsState.books = BOOKS;
    openSchedule();
    expect((screen.getByRole('button', { name: DISTRIBUTE }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Sincronize o calendário antes de distribuir os capítulos.')).toBeTruthy();
  });

  it('distribuir fica bloqueado quando nenhum livro do plano tem capítulos', () => {
    lessonsState.lessons = [{ id: 'l1', classNumber: 1, topicTitle: 'Aula 1', status: 'DRAFT', chapters: [] }];
    lessonsState.books = [{ ...BOOKS[0], chapters: [] }];
    openSchedule();
    expect((screen.getByRole('button', { name: DISTRIBUTE }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Nenhum livro do plano tem capítulos cadastrados.')).toBeTruthy();
  });

  it('com aulas já mapeadas pede confirmação; cancelar não chama a API', () => {
    lessonsState.books = BOOKS;
    lessonsState.lessons = [{ id: 'l1', classNumber: 1, topicTitle: 'Aula 1', status: 'DRAFT', chapters: [{ chapterId: 'ch3', chapter: { order: 3 } }] }];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openSchedule();
    fireEvent.click(screen.getByRole('button', { name: DISTRIBUTE }));
    expect(confirm).toHaveBeenCalledWith('Algumas aulas em rascunho já têm capítulos ou título personalizado. Substituir?');
    expect(lessonsState.distributeChapters).not.toHaveBeenCalled();
  });

  it('aula em rascunho sem capítulos com título personalizado pede confirmação; cancelar não chama a API', () => {
    lessonsState.books = BOOKS;
    lessonsState.lessons = [{ id: 'l1', classNumber: 1, topicTitle: 'Modelagem ER', status: 'DRAFT', chapters: [] }];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openSchedule();
    fireEvent.click(screen.getByRole('button', { name: DISTRIBUTE }));
    expect(confirm).toHaveBeenCalledWith('Algumas aulas em rascunho já têm capítulos ou título personalizado. Substituir?');
    expect(lessonsState.distributeChapters).not.toHaveBeenCalled();
  });

  it('aula publicada com título personalizado não pede confirmação', async () => {
    lessonsState.books = BOOKS;
    lessonsState.lessons = [{ id: 'l1', classNumber: 1, topicTitle: 'Modelagem ER', status: 'PUBLISHED', chapters: [] }];
    lessonsState.distributeChapters.mockResolvedValue({ updated: 0, skippedPublished: 1 });
    const confirm = vi.spyOn(window, 'confirm');
    openSchedule();
    fireEvent.click(screen.getByRole('button', { name: DISTRIBUTE }));
    await screen.findByRole('status');
    expect(confirm).not.toHaveBeenCalled();
    expect(lessonsState.distributeChapters).toHaveBeenCalledWith('sch-9');
  });

  it('sem capítulos nas aulas não pede confirmação e sucesso mostra atualizadas e puladas', async () => {
    lessonsState.books = BOOKS;
    lessonsState.lessons = [{ id: 'l1', classNumber: 1, topicTitle: 'Aula 1', status: 'DRAFT', chapters: [] }];
    lessonsState.distributeChapters.mockResolvedValue({ updated: 4, skippedPublished: 2 });
    const confirm = vi.spyOn(window, 'confirm');
    openSchedule();
    fireEvent.click(screen.getByRole('button', { name: DISTRIBUTE }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('Capítulos distribuídos em 4 aulas; 2 aulas publicadas não foram alteradas.');
    expect(confirm).not.toHaveBeenCalled();
    expect(lessonsState.distributeChapters).toHaveBeenCalledWith('sch-9');
    expect(lessonsState.reloadLessons).toHaveBeenCalled();
  });

  it('erro 503 mostra a mensagem do servidor em alerta', async () => {
    lessonsState.books = BOOKS;
    lessonsState.lessons = [{ id: 'l1', classNumber: 1, topicTitle: 'Aula 1', status: 'DRAFT', chapters: [] }];
    lessonsState.distributeChapters.mockRejectedValue(new Error('IA indisponível'));
    openSchedule();
    fireEvent.click(screen.getByRole('button', { name: DISTRIBUTE }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('IA indisponível');
  });
});

const GENERATE = /Gerar unidades do plano/;
const WITH_CHAPTERS = [{ id: 'l1', classNumber: 1, topicTitle: 'Aula 1', status: 'DRAFT', chapters: [{ chapterId: 'ch3', chapter: { order: 3 } }] }];

describe('SchedulesPage unidades do plano', () => {
  it('gerar unidades fica desabilitado sem aulas com capítulos', () => {
    lessonsState.lessons = [{ id: 'l1', classNumber: 1, topicTitle: 'Aula 1', status: 'DRAFT', chapters: [] }];
    openSchedule();
    expect((screen.getByRole('button', { name: GENERATE }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('plano sem unidades gera sem confirmar e mostra quantas unidades', async () => {
    lessonsState.lessons = WITH_CHAPTERS;
    lessonsState.generatePlanUnits.mockResolvedValue([1, 2, 3, 4].map((n) => ({ unitNumber: n, title: `U${n}`, topics: [], chapterIds: [] })));
    const confirm = vi.spyOn(window, 'confirm');
    openSchedule();
    fireEvent.click(screen.getByRole('button', { name: GENERATE }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('4 unidades geradas no plano.');
    expect(lessonsState.generatePlanUnits).toHaveBeenCalledWith('sch-9');
    expect(lessonsState.reloadPlans).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('plano com unidades pede confirmação; cancelar não chama a API', () => {
    lessonsState.lessons = WITH_CHAPTERS;
    plans[1].unitsContent = [{ unitNumber: 1, title: 'U1', topics: ['t'] }] as never;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openSchedule();
    fireEvent.click(screen.getByRole('button', { name: GENERATE }));
    expect(confirm).toHaveBeenCalledWith('O plano já tem unidades. Substituir pelas geradas?');
    expect(lessonsState.generatePlanUnits).not.toHaveBeenCalled();
  });
});
