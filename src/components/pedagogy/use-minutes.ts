'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { MinuteDTO, MinuteFilter } from '@/domains/pedagogy/services/minutes-service';
import type { TeacherStruggleHeatmap } from '@/domains/pedagogy/types';

const GENERIC_ERROR = 'Não foi possível carregar os dados pedagógicos. Tente novamente.';
const GENERATE_ERROR = 'Não foi possível gerar a ata. Tente novamente.';

export function buildMinuteQuery(filter: MinuteFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function fetchField<T>(url: string, field: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(typeof body?.error === 'string' ? body.error : GENERIC_ERROR);
  }
  return body[field] as T;
}

interface AsyncState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
}

function useRemoteList<T>(url: string | null, field: string): AsyncState<T[]> {
  const [state, setState] = React.useState<AsyncState<T[]>>({ data: [], isLoading: url !== null, error: null });

  React.useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    fetchField<T[]>(url, field, controller.signal)
      .then((data) => setState({ data, isLoading: false, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ data: [], isLoading: false, error: err instanceof Error ? err.message : GENERIC_ERROR });
      });
    return () => controller.abort();
  }, [url, field]);

  return state;
}

/** Atas visíveis ao usuário autenticado, filtradas. */
export function useMinutes(filter: MinuteFilter = {}): AsyncState<MinuteDTO[]> {
  return useRemoteList<MinuteDTO>(`${API_ROUTES.PEDAGOGY_MINUTES}${buildMinuteQuery(filter)}`, 'minutes');
}

/** Mapa de calor de dificuldades (professor/admin). */
export function useHeatmap(filter: MinuteFilter = {}): AsyncState<TeacherStruggleHeatmap[]> {
  return useRemoteList<TeacherStruggleHeatmap>(
    `${API_ROUTES.PEDAGOGY_HEATMAP}${buildMinuteQuery(filter)}`,
    'heatmap'
  );
}

/** Gera (ou reaproveita) a ata do usuário para a agenda informada. */
export function useGeneratedMinute(agendaId: string, enabled: boolean): {
  minute: MinuteDTO | null;
  isLoading: boolean;
  error: string | null;
} {
  const [state, setState] = React.useState<{ minute: MinuteDTO | null; isLoading: boolean; error: string | null }>({
    minute: null,
    isLoading: enabled,
    error: null,
  });

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ minute: null, isLoading: true, error: null });
    fetch(API_ROUTES.PEDAGOGY_MINUTES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agendaId }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.success) {
          throw new Error(typeof body?.error === 'string' ? body.error : GENERATE_ERROR);
        }
        setState({ minute: body.minute as MinuteDTO, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ minute: null, isLoading: false, error: err instanceof Error ? err.message : GENERATE_ERROR });
      });
    return () => controller.abort();
  }, [agendaId, enabled]);

  return state;
}
