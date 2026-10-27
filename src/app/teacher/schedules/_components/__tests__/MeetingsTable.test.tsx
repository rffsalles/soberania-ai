// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MeetingsTable } from '../MeetingsTable';

afterEach(cleanup);

const schedule = {
  id: 's1', teachingPlanId: 'p1', startDate: '2026-02-02T00:00:00.000Z', endDate: '2026-02-09T00:00:00.000Z',
  totalClasses: 2, startTime: '19:00', holidays: { weekdays: [1], holidays: [] },
};

describe('MeetingsTable coluna Capítulos', () => {
  it('mostra "Cap. 2.1, 2.3" na aula mapeada e traço na sem capítulos', () => {
    const lessons = [
      { id: 'l1', classNumber: 1, topicTitle: 'Aula 1', status: 'DRAFT' as const, chapters: [{ chapterId: 'a', chapter: { order: 5, number: '2.3' } }, { chapterId: 'b', chapter: { order: 3, number: '2.1' } }] },
      { id: 'l2', classNumber: 2, topicTitle: 'Aula 2', status: 'DRAFT' as const, chapters: [] },
    ];
    render(<MeetingsTable schedule={schedule} lessons={lessons} />);
    expect(screen.getByText('Capítulos')).toBeTruthy();
    expect(screen.getByText('Cap. 2.1, 2.3')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
