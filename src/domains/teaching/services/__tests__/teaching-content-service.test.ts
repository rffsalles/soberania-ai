import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import {
  createAssessment,
  createLesson,
  createSchedule,
  listAssessments,
  listLessons,
  listSchedules,
  updateLesson,
  type TeachingContentDeps,
} from '../teaching-content-service';

const teacher = { id: 't1', role: Role.TEACHER };
const admin = { id: 'a1', role: Role.ADMIN };

function makeDeps() {
  const calls: Record<string, unknown[]> = {};
  const rec = (name: string, arg: unknown) => {
    (calls[name] ||= []).push(arg);
  };
  const deps: TeachingContentDeps = {
    repo: {
      findPlanOwner: async (id) => (id === 'own' ? { teacherId: 't1' } : id === 'foreign' ? { teacherId: 't2' } : null),
      findScheduleOwner: async (id) =>
        id === 'own' ? { teachingPlan: { teacherId: 't1' } } : id === 'foreign' ? { teachingPlan: { teacherId: 't2' } } : null,
      findLessonOwner: async (id) =>
        id === 'own'
          ? { courseSchedule: { teachingPlan: { teacherId: 't1' } } }
          : id === 'foreign'
            ? { courseSchedule: { teachingPlan: { teacherId: 't2' } } }
            : null,
      listSchedulesByPlan: async (f) => (rec('listSchedules', f), []),
      createSchedule: async (d) => (rec('createSchedule', d), d),
      listLessonsBySchedule: async (f) => (rec('listLessons', f), []),
      createLesson: async (d) => (rec('createLesson', d), d),
      updateLesson: async (id, d) => (rec('updateLesson', { id, d }), d),
      listAssessmentsByPlan: async (f) => (rec('listAssessments', f), []),
      createAssessment: async (d) => (rec('createAssessment', d), d),
    },
  };
  return { deps, calls };
}

const scheduleInput = (teachingPlanId: string) => ({ teachingPlanId, startDate: '2026-02-01', endDate: '2026-06-30' });

describe('teaching-content-service ownership', () => {
  it('TEACHER cannot create schedule/lesson/assessment on foreign parents (403)', async () => {
    const { deps, calls } = makeDeps();
    await expect(createSchedule(teacher, scheduleInput('foreign'), deps)).rejects.toMatchObject({ status: 403 });
    await expect(createLesson(teacher, { courseScheduleId: 'foreign', topicTitle: 'x' }, deps)).rejects.toMatchObject({ status: 403 });
    await expect(createAssessment(teacher, { teachingPlanId: 'foreign', title: 'x' }, deps)).rejects.toMatchObject({ status: 403 });
    expect(calls.createSchedule).toBeUndefined();
    expect(calls.createLesson).toBeUndefined();
    expect(calls.createAssessment).toBeUndefined();
  });

  it('missing parents give 404', async () => {
    const { deps } = makeDeps();
    await expect(createSchedule(teacher, scheduleInput('nope'), deps)).rejects.toMatchObject({ status: 404 });
    await expect(createLesson(teacher, { courseScheduleId: 'nope', topicTitle: 'x' }, deps)).rejects.toMatchObject({ status: 404 });
    await expect(createAssessment(teacher, { teachingPlanId: 'nope', title: 'x' }, deps)).rejects.toMatchObject({ status: 404 });
    await expect(updateLesson('nope', teacher, { topicTitle: 'y' }, deps)).rejects.toMatchObject({ status: 404 });
  });

  it('invalid input gives 400', async () => {
    const { deps } = makeDeps();
    await expect(createSchedule(teacher, { teachingPlanId: 'own' }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(createLesson(teacher, { courseScheduleId: 'own' }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(createAssessment(teacher, { teachingPlanId: 'own' }, deps)).rejects.toMatchObject({ status: 400 });
  });

  it('TEACHER creates on own parents; ADMIN bypasses ownership', async () => {
    const { deps, calls } = makeDeps();
    await createSchedule(teacher, scheduleInput('own'), deps);
    await createSchedule(admin, scheduleInput('foreign'), deps);
    await createLesson(admin, { courseScheduleId: 'foreign', topicTitle: 'x' }, deps);
    await createAssessment(admin, { teachingPlanId: 'foreign', title: 'x' }, deps);
    expect(calls.createSchedule).toHaveLength(2);
    expect(calls.createLesson).toHaveLength(1);
    expect(calls.createAssessment).toHaveLength(1);
  });

  it('TEACHER lists are scoped by teacherId; ADMIN lists are not', async () => {
    const { deps, calls } = makeDeps();
    await listSchedules(teacher, 'p1', deps);
    await listLessons(teacher, 's1', deps);
    await listAssessments(teacher, 'p1', deps);
    expect(calls.listSchedules).toEqual([{ planId: 'p1', teacherId: 't1' }]);
    expect(calls.listLessons).toEqual([{ scheduleId: 's1', teacherId: 't1' }]);
    expect(calls.listAssessments).toEqual([{ planId: 'p1', teacherId: 't1' }]);
    await listSchedules(admin, undefined, deps);
    expect(calls.listSchedules[1]).toEqual({ planId: undefined });
  });

  it('updateLesson enforces ownership and never forwards courseScheduleId', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateLesson('foreign', teacher, { topicTitle: 'y' }, deps)).rejects.toMatchObject({ status: 403 });
    const evil = { topicTitle: 'y', courseScheduleId: 'other', id: 'zzz' } as never;
    await updateLesson('own', teacher, evil, deps);
    expect(calls.updateLesson).toEqual([{ id: 'own', d: { topicTitle: 'y' } }]);
  });
});
