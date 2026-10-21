import { describe, it, expect } from 'vitest';
import { createScheduleSchema } from '../schedule.validator';
import { SCHEDULE_MAX_HOLIDAYS } from '@/lib/constants/teaching';

const valid = { teachingPlanId: 'p1', startDate: '2026-02-01', endDate: '2026-06-30', weekdays: [1, 3], holidays: [] as string[] };

describe('createScheduleSchema', () => {
  it('accepts a valid payload', () => {
    expect(createScheduleSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a span over 366 days', () => {
    expect(createScheduleSchema.safeParse({ ...valid, endDate: '9999-12-31' }).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...valid, startDate: '2026-01-01', endDate: '2027-02-05' }).success).toBe(false);
  });

  it('rejects too many holidays', () => {
    const holidays = Array.from({ length: SCHEDULE_MAX_HOLIDAYS + 1 }, () => '2026-03-02');
    expect(createScheduleSchema.safeParse({ ...valid, holidays }).success).toBe(false);
  });

  it('usa 19:00 como horário de início padrão e aceita HH:mm', () => {
    expect(createScheduleSchema.parse(valid).startTime).toBe('19:00');
    expect(createScheduleSchema.parse({ ...valid, startTime: '07:30' }).startTime).toBe('07:30');
  });

  it('rejeita horário de início fora do formato HH:mm', () => {
    for (const startTime of ['7:30', '24:00', '19h', '19:60']) {
      expect(createScheduleSchema.safeParse({ ...valid, startTime }).success).toBe(false);
    }
  });
});
