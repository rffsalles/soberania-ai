'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import { requestJson } from '@/components/assessments/use-assessments';

export type ScheduleLesson = {
  id: string;
  classNumber: number;
  topicTitle: string;
  status: 'DRAFT' | 'PUBLISHED';
  chapters: { chapterId: string; chapter: { order: number } }[];
};

export type DistributionResult = { updated: number; skippedPublished: number };

export type ScheduleItem = {
  id: string;
  teachingPlanId: string;
  startDate: string;
  endDate: string;
  totalClasses: number;
  startTime: string;
  holidays: { weekdays?: number[]; holidays?: string[] } | null;
};

export type ScheduleDraft = {
  teachingPlanId: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  holidays: string[];
  /** HH:mm no fuso da instituição. */
  startTime: string;
};

export type SyncResult = { created: number; existing: number };

const NO_SCHEDULES: ScheduleItem[] = [];
const NO_LESSONS: ScheduleLesson[] = [];

function useList<T>(url: string | null, pick: (body: never) => T[], empty: T[]) {
  const [state, setState] = React.useState({ data: empty, isLoading: url !== null, error: null as string | null });
  const [version, setVersion] = React.useState(0);
  const pickRef = React.useRef(pick);

  React.useEffect(() => {
    if (!url) {
      setState({ data: empty, isLoading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    requestJson<never>(url, 'GET')
      .then((body) => !cancelled && setState({ data: pickRef.current(body), isLoading: false, error: null }))
      .catch((err: Error) => !cancelled && setState({ data: empty, isLoading: false, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [url, version, empty]);

  const reload = React.useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

export function useSchedules(planId: string | null) {
  const url = planId ? `${API_ROUTES.TEACHER_SCHEDULES}?planId=${encodeURIComponent(planId)}` : null;
  const { data, ...rest } = useList(url, (b: { schedules: ScheduleItem[] }) => b.schedules, NO_SCHEDULES);
  return { schedules: data, ...rest };
}

export function useScheduleLessons(scheduleId: string | null) {
  const url = scheduleId ? `${API_ROUTES.TEACHER_LESSONS}?scheduleId=${encodeURIComponent(scheduleId)}` : null;
  const { data, ...rest } = useList(url, (b: { lessons: ScheduleLesson[] }) => b.lessons, NO_LESSONS);
  return { lessons: data, ...rest };
}

export async function createSchedule(draft: ScheduleDraft) {
  await requestJson(API_ROUTES.TEACHER_SCHEDULES, 'POST', draft);
}

export async function syncSchedule(scheduleId: string): Promise<SyncResult> {
  const body = await requestJson<{ result: SyncResult }>(`${API_ROUTES.TEACHER_SCHEDULES}/${scheduleId}/sync`, 'POST');
  return body.result;
}

export async function distributeChapters(scheduleId: string): Promise<DistributionResult> {
  const body = await requestJson<{ result: DistributionResult }>(`${API_ROUTES.TEACHER_SCHEDULES}/${scheduleId}/distribute-chapters`, 'POST');
  return body.result;
}

export type GeneratedUnit = { unitNumber: number; title: string; topics: string[]; chapterIds: string[] };

export async function generatePlanUnits(scheduleId: string): Promise<GeneratedUnit[]> {
  const body = await requestJson<{ units: GeneratedUnit[] }>(`${API_ROUTES.TEACHER_SCHEDULES}/${scheduleId}/generate-units`, 'POST');
  return body.units;
}
