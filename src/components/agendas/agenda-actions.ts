'use client';

import { API_ROUTES } from '@/lib/constants/routes';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import type { AgendaMinutesResult } from '@/domains/pedagogy/services/minutes-service';

const STATUS_ERROR = 'Não foi possível alterar o status da agenda. Tente novamente.';
const MINUTES_ERROR = 'Não foi possível gerar as atas. Tente novamente.';

async function send<T>(url: string, method: 'PATCH' | 'POST', payload: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(typeof body?.error === 'string' ? body.error : fallback);
  }
  return body as T;
}

/** Encerra (COMPLETED, que também gera as atas) ou cancela uma agenda. */
export async function changeAgendaStatus(
  agendaId: string,
  status: 'COMPLETED' | 'CANCELLED'
): Promise<{ agenda: AgendaDTO; minutesResult?: AgendaMinutesResult }> {
  return send(`${API_ROUTES.AGENDAS}/${agendaId}/status`, 'PATCH', { status }, STATUS_ERROR);
}

/** Gera (ou regenera) as atas de todos os alunos com interações na agenda. */
export async function generateClassMinutes(agendaId: string): Promise<AgendaMinutesResult> {
  const body = await send<{ summary: AgendaMinutesResult }>(
    API_ROUTES.PEDAGOGY_MINUTES,
    'POST',
    { agendaId },
    MINUTES_ERROR
  );
  return body.summary;
}
