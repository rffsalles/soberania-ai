'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';

const GENERIC_ERROR = 'Não foi possível carregar as agendas. Tente novamente.';
const HTTP_NOT_FOUND = 404;

interface ApiResult<T> {
  data: T | null;
  error: string | null;
  notFound: boolean;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { signal });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success) return { data: body as T, error: null, notFound: false };
    return {
      data: null,
      error: typeof body?.error === 'string' ? body.error : GENERIC_ERROR,
      notFound: res.status === HTTP_NOT_FOUND,
    };
  } catch {
    return { data: null, error: GENERIC_ERROR, notFound: false };
  }
}

/** Lista as agendas visíveis ao usuário autenticado; mudar `reloadKey` recarrega a lista. */
export function useAgendas(reloadKey = 0): { agendas: AgendaDTO[]; isLoading: boolean; error: string | null } {
  const [state, setState] = React.useState<{ agendas: AgendaDTO[]; isLoading: boolean; error: string | null }>({
    agendas: [],
    isLoading: true,
    error: null,
  });

  React.useEffect(() => {
    const controller = new AbortController();
    fetchJson<{ agendas: AgendaDTO[] }>(API_ROUTES.AGENDAS, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setState({ agendas: result.data?.agendas ?? [], isLoading: false, error: result.error });
    });
    return () => controller.abort();
  }, [reloadKey]);

  return state;
}

/** Carrega uma agenda pelo id; `notFound` indica agenda inexistente ou fora do escopo. */
export function useAgenda(id: string): {
  agenda: AgendaDTO | null;
  isLoading: boolean;
  error: string | null;
  notFound: boolean;
} {
  const [state, setState] = React.useState<{
    agenda: AgendaDTO | null;
    isLoading: boolean;
    error: string | null;
    notFound: boolean;
  }>({ agenda: null, isLoading: true, error: null, notFound: false });

  React.useEffect(() => {
    const controller = new AbortController();
    setState({ agenda: null, isLoading: true, error: null, notFound: false });
    fetchJson<{ agenda: AgendaDTO }>(`${API_ROUTES.AGENDAS}/${encodeURIComponent(id)}`, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setState({
          agenda: result.data?.agenda ?? null,
          isLoading: false,
          error: result.error,
          notFound: result.notFound,
        });
      },
    );
    return () => controller.abort();
  }, [id]);

  return state;
}
