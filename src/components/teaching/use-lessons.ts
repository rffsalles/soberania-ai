'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import { requestJson, RequestError } from '@/components/assessments/use-assessments';
import type { TimeScriptItem } from '@/domains/teaching/time-script';
import type { LessonMediaType, LessonStatusValue } from '@/lib/constants/teaching';

export type LessonItem = {
  id: string;
  classNumber: number;
  classDate: string;
  topicTitle: string;
  dailyObjective: string;
  timeScript: TimeScriptItem[];
  methodology: string;
  resourcesNeeded: string[];
  fixationExercise: string;
  mediaType: LessonMediaType | null;
  mediaUrl: string | null;
  status: LessonStatusValue;
  chapters: { chapterId: string; chapter: { order: number } }[];
  courseSchedule: { teachingPlanId: string };
};

export type LessonDraft = Pick<
  LessonItem,
  'topicTitle' | 'dailyObjective' | 'timeScript' | 'methodology' | 'resourcesNeeded' | 'fixationExercise' | 'mediaType'
> & {
  mediaUrl?: string | null;
  /** `AAAA-MM-DDTHH:mm` no fuso da instituição (valor do datetime-local). */
  classDate?: string;
  chapterIds?: string[];
};

const NO_LESSONS: LessonItem[] = [];
const UPLOAD_ERROR = 'Não foi possível enviar o arquivo. Tente novamente.';
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;
const PERCENT = 100;

export function useLessons(scheduleId: string | null) {
  const url = scheduleId ? `${API_ROUTES.TEACHER_LESSONS}?scheduleId=${encodeURIComponent(scheduleId)}` : null;
  const [state, setState] = React.useState({ lessons: NO_LESSONS, isLoading: url !== null, error: null as string | null });
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    if (!url) {
      setState({ lessons: NO_LESSONS, isLoading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    requestJson<{ lessons: LessonItem[] }>(url, 'GET')
      .then((body) => !cancelled && setState({ lessons: body.lessons, isLoading: false, error: null }))
      .catch((err: Error) => !cancelled && setState({ lessons: NO_LESSONS, isLoading: false, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  const reload = React.useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

export async function saveLesson(id: string, draft: LessonDraft): Promise<LessonItem> {
  const body = await requestJson<{ lesson: LessonItem }>(`${API_ROUTES.TEACHER_LESSONS}/${id}`, 'PUT', draft);
  return body.lesson;
}

export type GeneratedLesson = {
  dailyObjective: string;
  methodology: string;
  resourcesNeeded: string[];
  fixationExercise: string;
  timeScript: TimeScriptItem[];
  citations: string[];
};

export async function generateLesson(id: string): Promise<GeneratedLesson> {
  const body = await requestJson<{ data: GeneratedLesson }>(`${API_ROUTES.TEACHER_LESSONS}/${id}/generate`, 'POST');
  return body.data;
}

export async function refineLesson(
  id: string,
  body: {
    field: 'dailyObjective' | 'methodology' | 'fixationExercise' | 'timeScript';
    stepIndex?: number;
    instruction: string;
    current: string;
  },
): Promise<string> {
  const res = await requestJson<{ text: string }>(`${API_ROUTES.TEACHER_LESSONS}/${id}/refine`, 'POST', body);
  return res.text;
}

export async function setLessonStatus(id: string, status: LessonStatusValue): Promise<LessonItem> {
  const body = await requestJson<{ lesson: LessonItem }>(`${API_ROUTES.TEACHER_LESSONS}/${id}/status`, 'PUT', { status });
  return body.lesson;
}

/** Envia a mídia por XHR para reportar o progresso do upload. */
export function uploadLessonMedia(id: string, file: File, onProgress: (percent: number) => void): Promise<LessonItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_ROUTES.TEACHER_LESSONS}/${id}/media`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * PERCENT));
    xhr.onerror = () => reject(new RequestError(UPLOAD_ERROR, 0));
    xhr.onload = () => {
      let body: { success?: boolean; lesson?: LessonItem; error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= HTTP_OK_MIN && xhr.status < HTTP_OK_MAX && body?.success && body.lesson) resolve(body.lesson);
      else reject(new RequestError(body?.error ?? UPLOAD_ERROR, xhr.status));
    };
    xhr.send(form);
  });
}
