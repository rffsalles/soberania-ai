'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import { useCurrentUser } from '@/components/layout/use-current-user';
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

function useRemoteList<T>(url: string | null, field: string, reloadKey = 0): AsyncState<T[]> {
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
  }, [url, field, reloadKey]);

  return state;
}

/** Atas visíveis ao usuário autenticado, filtradas; mudar `reloadKey` recarrega. */
export function useMinutes(filter: MinuteFilter = {}, reloadKey = 0): AsyncState<MinuteDTO[]> {
  return useRemoteList<MinuteDTO>(`${API_ROUTES.PEDAGOGY_MINUTES}${buildMinuteQuery(filter)}`, 'minutes', reloadKey);
}

/** Mapa de calor de dificuldades (professor/admin); mudar `reloadKey` recarrega. */
export function useHeatmap(filter: MinuteFilter = {}, reloadKey = 0): AsyncState<TeacherStruggleHeatmap[]> {
  return useRemoteList<TeacherStruggleHeatmap>(
    `${API_ROUTES.PEDAGOGY_HEATMAP}${buildMinuteQuery(filter)}`,
    'heatmap',
    reloadKey
  );
}

const STAFF_MINUTE_INFO =
  'A ata individual é emitida para alunos. Use "Gerar atas" em Relatórios para a turma inteira.';

async function readMinute(res: Response): Promise<MinuteDTO | null> {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(typeof body?.error === 'string' ? body.error : GENERATE_ERROR);
  }
  return (body.minute as MinuteDTO | undefined) ?? (body.minutes as MinuteDTO[] | undefined)?.[0] ?? null;
}

/**
 * Ata do aluno autenticado para a agenda: sempre pede ao servidor, que devolve a ata em cache ou a regenera
 * quando não há ata, ela ficou sem parecer da IA ou há conversa posterior a ela. Professores e administradores recebem um aviso em vez da ata.
 */
export function useGeneratedMinute(agendaId: string, enabled: boolean): {
  minute: MinuteDTO | null;
  isLoading: boolean;
  error: string | null;
} {
  const { user, isLoading: userLoading } = useCurrentUser(undefined, enabled);
  const [state, setState] = React.useState<{ minute: MinuteDTO | null; isLoading: boolean; error: string | null }>({
    minute: null,
    isLoading: enabled,
    error: null,
  });

  React.useEffect(() => {
    if (!enabled || userLoading) return;
    if (user?.role !== 'STUDENT') {
      setState({ minute: null, isLoading: false, error: user ? STAFF_MINUTE_INFO : GENERATE_ERROR });
      return;
    }
    const controller = new AbortController();
    setState({ minute: null, isLoading: true, error: null });
    // O serviço decide: devolve a ata em cache ou regenera quando há conversa nova.
    fetch(API_ROUTES.PEDAGOGY_MINUTES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agendaId }),
      signal: controller.signal,
    })
      .then(readMinute)
      .then((minute) => {
        if (!minute) throw new Error(GENERATE_ERROR);
        setState({ minute, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ minute: null, isLoading: false, error: err instanceof Error ? err.message : GENERATE_ERROR });
      });
    return () => controller.abort();
  }, [agendaId, enabled, user, userLoading]);

  return state;
}
