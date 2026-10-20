import { describe, it, expect } from 'vitest';
import { getAgendaLink } from '../routes';

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
