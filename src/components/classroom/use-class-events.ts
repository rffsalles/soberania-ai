'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { CLASS_EVENT_TYPES, type ClassEventDTO } from '@/domains/classroom/class-event-schema';
import { reduceClassState, type ClassState } from '@/domains/classroom/class-state';

export type ClassEventsStatus = 'live' | 'polling' | 'offline';

const ERROR_GRACE_MS = 10_000;
const POLL_INTERVAL_MS = 5_000;
const RETRY_STREAM_MS = 30_000;

function merge(prev: ClassEventDTO[], incoming: ClassEventDTO[]): ClassEventDTO[] {
  const known = new Set(prev.map((e) => e.seq));
  const fresh = incoming.filter((e) => !known.has(e.seq) && known.add(e.seq));
  if (fresh.length === 0) return prev;
  return [...prev, ...fresh].sort((a, b) => a.seq - b.seq);
}

export function useClassEvents(
  agendaId: string,
  options: { after?: number } = {},
): { events: ClassEventDTO[]; status: ClassEventsStatus; lastSeq: number; state: ClassState } {
  const after = options.after ?? 0;
  const [events, setEvents] = useState<ClassEventDTO[]>([]);
  const [status, setStatus] = useState<ClassEventsStatus>('polling');
  const [lastSeq, setLastSeq] = useState(after);
  const lastSeqRef = useRef(after);

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let errorTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    lastSeqRef.current = after;
    setEvents([]);
    setLastSeq(after);
    setStatus('polling');

    const advance = (seq: number) => {
      if (seq > lastSeqRef.current) {
        lastSeqRef.current = seq;
        setLastSeq(seq);
      }
    };
    const clearErrorTimer = () => {
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = null;
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/agendas/${agendaId}/events?after=${lastSeqRef.current}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { events?: ClassEventDTO[]; lastSeq?: number };
        if (disposed) return;
        const incoming = body.events ?? [];
        setEvents((prev) => merge(prev, incoming));
        advance(Math.max(body.lastSeq ?? 0, ...incoming.map((e) => e.seq)));
        setStatus((s) => (s === 'live' ? s : 'polling'));
      } catch {
        if (!disposed) setStatus((s) => (s === 'live' ? s : 'offline'));
      }
    };

    const startPolling = () => {
      if (!pollTimer) pollTimer = setInterval(poll, POLL_INTERVAL_MS);
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, RETRY_STREAM_MS);
      }
    };

    const connect = () => {
      source?.close();
      const es = new EventSource(`/api/v1/agendas/${agendaId}/events/stream?after=${lastSeqRef.current}`);
      source = es;
      es.addEventListener('open', () => {
        clearErrorTimer();
        stopPolling();
        setStatus('live');
      });
      es.addEventListener('error', () => {
        if (errorTimer) return;
        errorTimer = setTimeout(() => {
          errorTimer = null;
          es.close();
          setStatus('polling');
          startPolling();
        }, ERROR_GRACE_MS);
      });
      for (const type of CLASS_EVENT_TYPES) {
        es.addEventListener(type, (raw) => {
          try {
            const dto = JSON.parse((raw as MessageEvent).data) as ClassEventDTO;
            if (typeof dto?.seq !== 'number') return;
            setEvents((prev) => merge(prev, [dto]));
            advance(dto.seq);
          } catch {
            // frame malformado: ignora
          }
        });
      }
    };

    connect();

    return () => {
      disposed = true;
      clearErrorTimer();
      stopPolling();
      source?.close();
    };
  }, [agendaId, after]);

  const state = useMemo(() => reduceClassState(events), [events]);
  return { events, status, lastSeq, state };
}
