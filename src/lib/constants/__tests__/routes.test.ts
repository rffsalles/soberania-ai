import { describe, it, expect } from 'vitest';
import { getAgendaLink, adminClassStudentsPath, API_ROUTES } from '../routes';

describe('getAgendaLink', () => {
  it('maps CLASSROOM to the classroom page', () => {
    expect(getAgendaLink({ id: 'a1', type: 'CLASSROOM' })).toBe('/classroom/a1');
  });
  it('maps STUDY_GROUP to the study group page', () => {
    expect(getAgendaLink({ id: 'a2', type: 'STUDY_GROUP' })).toBe('/study-group/a2');
  });
  it('maps EXAM to the exam page', () => {
    expect(getAgendaLink({ id: 'a3', type: 'EXAM' })).toBe('/exam/a3');
  });
  it('maps OFFICE_HOURS to the office hours page', () => {
    expect(getAgendaLink({ id: 'a4', type: 'OFFICE_HOURS' })).toBe('/office-hours/a4');
  });
  it('maps DRAFT_REVIEW to the draft review page', () => {
    expect(getAgendaLink({ id: 'a5', type: 'DRAFT_REVIEW' })).toBe('/draft-review/a5');
  });
});

describe('rotas de matrícula de alunos', () => {
  it('monta a página de alunos da turma', () => {
    expect(adminClassStudentsPath('c1')).toBe('/admin/classes/c1/students');
  });
  it('expõe a rota da API de alunos', () => {
    expect(API_ROUTES.ADMIN_STUDENTS).toBe('/api/v1/admin/students');
  });
});
