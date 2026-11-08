'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { FAQItem } from '@/domains/pedagogy/faq-builder';
import type { AgendaLessonDTO } from '@/domains/teaching/services/agenda-lesson-service';

async function fetchField<T>(url: string, field: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    const body = await res.json().catch(() => null);
    return res.ok && body?.success ? (body[field] as T) : null;
  } catch {
    return null;
  }
}

/** Plano de aula (vídeo e roteiro) vinculado à agenda; `lesson` é null enquanto carrega ou sem plano. */
export function useAgendaLesson(agendaId: string): { lesson: AgendaLessonDTO | null; isLoading: boolean } {
  const [state, setState] = React.useState<{ lesson: AgendaLessonDTO | null; isLoading: boolean }>({
    lesson: null,
    isLoading: true,
  });

  React.useEffect(() => {
    const controller = new AbortController();
    setState({ lesson: null, isLoading: true });
    fetchField<AgendaLessonDTO>(
      `${API_ROUTES.AGENDAS}/${encodeURIComponent(agendaId)}/lesson`,
      'lesson',
      controller.signal
    ).then((lesson) => {
      if (!controller.signal.aborted) setState({ lesson, isLoading: false });
    });
    return () => controller.abort();
  }, [agendaId]);

  return state;
}

/** FAQ dinâmica da agenda; recarrega na montagem e sempre que `reloadKey` muda. */
export function useAgendaFaqs(
  agendaId: string,
  reloadKey: string | number
): { faqs: FAQItem[]; isLoading: boolean } {
  const [state, setState] = React.useState<{ faqs: FAQItem[]; isLoading: boolean }>({ faqs: [], isLoading: true });

  React.useEffect(() => {
    const controller = new AbortController();
    fetchField<FAQItem[]>(
      `${API_ROUTES.AGENDAS}/${encodeURIComponent(agendaId)}/faqs`,
      'faqs',
      controller.signal
    ).then((faqs) => {
      if (!controller.signal.aborted) setState((prev) => ({ faqs: faqs ?? prev.faqs, isLoading: false }));
    });
    return () => controller.abort();
  }, [agendaId, reloadKey]);

  return state;
}
