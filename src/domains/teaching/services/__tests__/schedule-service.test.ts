import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { createSchedule, syncLessons, type ScheduleDeps } from '../schedule-service';

const teacher = { id: 't1', role: Role.TEACHER };
const admin = { id: 'a1', role: Role.ADMIN };

const MONDAY = 1;
const WEDNESDAY = 3;

function makeDeps(ownerId = 't1') {
  const lessons: { classNumber: number; classDate: Date; topicTitle: string }[] = [];
  const created: Record<string, unknown>[] = [];
  const deps: ScheduleDeps = {
    repo: {
      findPlanOwner: async (id) => (id === 'missing' ? null : { teacherId: ownerId }),
      findScheduleForSync: async (id) =>
        id === 'missing'
          ? null
          : {
              id,
              startDate: new Date('2026-02-01T00:00:00Z'),
              endDate: new Date('2026-03-04T00:00:00Z'),
              holidays: { weekdays: [MONDAY, WEDNESDAY], holidays: ['2026-02-16'] },
              startTime: '19:30',
              teachingPlan: { teacherId: ownerId },
              lessonPlans: lessons.map((l) => ({ classNumber: l.classNumber })),
            },
      createSchedule: async (data) => (created.push(data), { id: 's1', ...data }),
      createLesson: async (data) => {
        lessons.push(data as never);
        return data;
      },
    },
  };
  return { deps, lessons, created };
}

const input = {
  teachingPlanId: 'p1',
  startTime: '19:00',
  startDate: '2026-02-01',
  endDate: '2026-03-04',
  weekdays: [MONDAY, WEDNESDAY],
  holidays: ['2026-02-16'],
};

describe('schedule-service', () => {
  it('createSchedule stores rules and totalClasses = meetings', async () => {
    const { deps, created } = makeDeps();
    const result = await createSchedule(teacher, input, deps);
    expect(created[0]).toMatchObject({
      totalClasses: 9,
      startTime: '19:00',
      holidays: { weekdays: [MONDAY, WEDNESDAY], holidays: ['2026-02-16'] },
    });
    expect(result.meetings).toHaveLength(9);
  });

  it('createSchedule rejects foreign teachers (403), missing plans (404) and empty periods (400)', async () => {
    await expect(createSchedule(teacher, input, makeDeps('t2').deps)).rejects.toMatchObject({ status: 403 });
    await expect(createSchedule(teacher, { ...input, teachingPlanId: 'missing' }, makeDeps().deps)).rejects.toMatchObject({ status: 404 });
    await expect(
      createSchedule(teacher, { ...input, startDate: '2026-02-03', endDate: '2026-02-03' }, makeDeps().deps)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('syncLessons twice does not duplicate lessons', async () => {
    const { deps, lessons } = makeDeps();
    expect(await syncLessons('s1', teacher, deps)).toEqual({ created: 9, existing: 0 });
    expect(await syncLessons('s1', teacher, deps)).toEqual({ created: 0, existing: 9 });
    expect(lessons).toHaveLength(9);
    expect(lessons[0]).toMatchObject({ classNumber: 1, topicTitle: 'Aula 1' });
  });

  it('syncLessons grava classDate como o instante local data + horário de início (America/Sao_Paulo)', async () => {
    const { deps, lessons } = makeDeps();
    await syncLessons('s1', teacher, deps);
    // 02/02/2026 19:30 em São Paulo (UTC-3) = 22:30 UTC, não 00:00 UTC.
    expect(lessons[0].classDate.toISOString()).toBe('2026-02-02T22:30:00.000Z');
  });

  it('syncLessons rejects foreign teachers (403) but lets admins through', async () => {
    const { deps, lessons } = makeDeps('t2');
    await expect(syncLessons('s1', teacher, deps)).rejects.toMatchObject({ status: 403 });
    expect(lessons).toHaveLength(0);
    await expect(syncLessons('s1', admin, deps)).resolves.toMatchObject({ created: 9 });
    await expect(syncLessons('missing', admin, deps)).rejects.toMatchObject({ status: 404 });
  });
});
