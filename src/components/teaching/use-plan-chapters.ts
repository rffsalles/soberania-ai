'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import { requestJson } from '@/components/assessments/use-assessments';
import type { ClientPlanChapterBook } from './chapter-combobox-item';

const NO_BOOKS: ClientPlanChapterBook[] = [];

export function usePlanChapters(planId: string | null) {
  const [state, setState] = React.useState({ books: NO_BOOKS, isLoading: planId !== null, error: null as string | null });
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    if (!planId) {
      setState({ books: NO_BOOKS, isLoading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    requestJson<{ books: ClientPlanChapterBook[] }>(`${API_ROUTES.TEACHER_PLANS}/${encodeURIComponent(planId)}/chapters`, 'GET')
      .then((body) => !cancelled && setState({ books: body.books, isLoading: false, error: null }))
      .catch((err: Error) => !cancelled && setState({ books: NO_BOOKS, isLoading: false, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [planId, version]);

  const reload = React.useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
