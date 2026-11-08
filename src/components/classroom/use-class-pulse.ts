'use client';

import { useEffect, useState } from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { PulseEntry } from '@/domains/classroom/class-event-schema';

export const PULSE_REFRESH_MS = 10_000;

/**
 * Pulso da turma: lê na montagem e a cada `reloadKey`; com pergunta aberta, relê a cada 10 s
 * por um único setTimeout re-armado após cada leitura. Erro de rede mantém o último pulso.
 */
export function useClassPulse(agendaId: string, reloadKey: number, openQuestion: boolean): { pulse: PulseEntry[] } {
  const [pulse, setPulse] = useState<PulseEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const read = async () => {
      try {
        const res = await fetch(`${API_ROUTES.AGENDAS}/${encodeURIComponent(agendaId)}/pulse`);
        const body = await res.json().catch(() => null);
        if (!cancelled && res.ok && body?.success && Array.isArray(body.pulse)) {
          setPulse(body.pulse as PulseEntry[]);
        }
      } catch {
        // mantém o último pulso
      }
      if (!cancelled && openQuestion) timer = setTimeout(() => void read(), PULSE_REFRESH_MS);
    };

    void read();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [agendaId, reloadKey, openQuestion]);

  return { pulse };
}
