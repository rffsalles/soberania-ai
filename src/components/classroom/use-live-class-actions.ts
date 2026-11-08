'use client';

import { useCallback, useRef, useState } from 'react';
import { API_ROUTES } from '@/lib/constants/routes';

export type TeacherClassCommand =
  | { type: 'SESSION_STARTED' }
  | { type: 'STEP_CHANGED'; stepIndex: number }
  | { type: 'SESSION_ENDED' };

export const LIVE_ACTION_ERROR = 'Não foi possível registrar a ação. Tente novamente.';

export function useLiveClassActions(agendaId: string) {
  const [pending, setPending] = useState<TeacherClassCommand['type'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const send = useCallback(
    /** Devolve o maior seq dos eventos gravados (0 se nenhum) ou null em falha. */
    async (cmd: TeacherClassCommand): Promise<number | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(cmd.type);
      setError(null);
      try {
        const res = await fetch(`${API_ROUTES.AGENDAS}/${encodeURIComponent(agendaId)}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmd),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.success) {
          setError(typeof body?.error === 'string' ? body.error : LIVE_ACTION_ERROR);
          return null;
        }
        const events: unknown = body.events;
        return Array.isArray(events)
          ? events.reduce<number>((max, e) => (typeof e?.seq === 'number' ? Math.max(max, e.seq) : max), 0)
          : 0;
      } catch {
        setError(LIVE_ACTION_ERROR);
        return null;
      } finally {
        inFlight.current = false;
        setPending(null);
      }
    },
    [agendaId]
  );

  const clearError = useCallback(() => setError(null), []);

  return { send, pending, error, clearError };
}
