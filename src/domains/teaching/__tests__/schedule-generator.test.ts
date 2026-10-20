import { describe, it, expect } from 'vitest';
import { generateMeetings } from '../schedule-generator';

const MONDAY = 1;
const WEDNESDAY = 3;

describe('generateMeetings', () => {
  it('lists Mon+Wed between Feb and Mar 2026, skipping holidays with sequential numbering', () => {
    const meetings = generateMeetings({
      startDate: '2026-02-01',
      endDate: '2026-03-04',
      weekdays: [MONDAY, WEDNESDAY],
      holidays: ['2026-02-16'],
    });
    expect(meetings.map((m) => m.date)).toEqual([
      '2026-02-02',
      '2026-02-04',
      '2026-02-09',
      '2026-02-11',
      '2026-02-18',
      '2026-02-23',
      '2026-02-25',
      '2026-03-02',
      '2026-03-04',
    ]);
    expect(meetings.map((m) => m.classNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('includes both boundary dates', () => {
    const meetings = generateMeetings({ startDate: '2026-02-02', endDate: '2026-02-02', weekdays: [MONDAY], holidays: [] });
    expect(meetings).toEqual([{ classNumber: 1, date: '2026-02-02' }]);
  });

  it('rejects an empty weekday list and an inverted range with 400', () => {
    expect(() => generateMeetings({ startDate: '2026-02-01', endDate: '2026-03-01', weekdays: [], holidays: [] })).toThrowError(
      expect.objectContaining({ status: 400 })
    );
    expect(() => generateMeetings({ startDate: '2026-03-01', endDate: '2026-02-01', weekdays: [1], holidays: [] })).toThrowError(
      expect.objectContaining({ status: 400 })
    );
  });

  it('rejects spans over the maximum with 400', () => {
    expect(() => generateMeetings({ startDate: '2026-01-01', endDate: '2027-02-05', weekdays: [1], holidays: [] })).toThrowError(
      expect.objectContaining({ status: 400 })
    );
  });
});
