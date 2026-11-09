'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import { useClassEvents } from '@/components/classroom/use-class-events';
import { nextStalemateCheckAt } from '@/domains/agendas/study-group-stalemate';
import type { MessageDTO } from '@/domains/agendas/services/study-group-service';

const LOAD_ERROR = 'Não foi possível carregar as mensagens do grupo.';
import { TUTOR_UNAVAILABLE_MESSAGE } from '@/lib/constants/tutor';

const SEND_ERROR = 'Não foi possível enviar a mensagem. Tente novamente.';
const OPTIMISTIC_PREFIX = 'pending-';

function messagesUrl(agendaId: string): string {
  return `${API_ROUTES.AGENDAS}/${encodeURIComponent(agendaId)}/messages`;
}

/** Mescla por id e mantém a ordem cronológica (o POST pode trazer mensagens mais novas que as do polling). */
function mergeById(current: MessageDTO[], incoming: MessageDTO[]): MessageDTO[] {
  const seen = new Set(current.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  if (!added.length) return current;
  return [...current, ...added].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Mensagens do grupo de estudos atualizadas pelo canal de eventos da aula, com envio otimista. */
export function useStudyGroupMessages(
  agendaId: string,
  author: { id: string; name: string } | null,
  options: { stalemateEnabled?: boolean } = {},
): {
  messages: MessageDTO[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  send: (content: string) => Promise<boolean>;
} {
  const [messages, setMessages] = React.useState<MessageDTO[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastCreatedAt = React.useRef<string | null>(null);
  const pollInFlight = React.useRef(false);
  const pendingReload = React.useRef(false);
  const loadRef = React.useRef<() => void>(() => {});
  const prevGroupSeq = React.useRef<number | null>(null);
  const stalemateEnabled = options.stalemateEnabled ?? false;
  const { events } = useClassEvents(agendaId);

  /**
   * Aplica mensagens recebidas. Só o polling avança o cursor `lastCreatedAt`: o POST devolve a resposta da tutora,
   * criada segundos depois, e avançar por ela esconderia mensagens de colegas postadas nesse intervalo.
   */
  const apply = React.useCallback((incoming: MessageDTO[], fromPoll: boolean) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      // Mensagens reais substituem as otimistas equivalentes (mesmo autor e conteúdo).
      const real = new Set(incoming.map((m) => `${m.authorId}|${m.content}`));
      const cleaned = prev.filter((m) => !(m.id.startsWith(OPTIMISTIC_PREFIX) && real.has(`${m.authorId}|${m.content}`)));
      return mergeById(cleaned, incoming);
    });
    if (!fromPoll) return;
    const newest = incoming[incoming.length - 1]?.createdAt;
    if (newest && (!lastCreatedAt.current || newest > lastCreatedAt.current)) lastCreatedAt.current = newest;
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    lastCreatedAt.current = null;
    pollInFlight.current = false;
    pendingReload.current = false;
    prevGroupSeq.current = null;
    setMessages([]);
    setIsLoading(true);

    async function load() {
      if (pollInFlight.current) {
        pendingReload.current = true;
        return;
      }
      pollInFlight.current = true;
      try {
        const since = lastCreatedAt.current ? `?since=${encodeURIComponent(lastCreatedAt.current)}` : '';
        const res = await fetch(`${messagesUrl(agendaId)}${since}`, { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (res.ok && body?.success) {
          apply(body.messages as MessageDTO[], true);
          setError(null);
        } else {
          setError(typeof body?.error === 'string' ? body.error : LOAD_ERROR);
        }
      } catch {
        if (!controller.signal.aborted) setError(LOAD_ERROR);
      } finally {
        pollInFlight.current = false;
        if (!controller.signal.aborted) setIsLoading(false);
        if (pendingReload.current && !controller.signal.aborted) {
          pendingReload.current = false;
          void load();
        }
      }
    }

    loadRef.current = () => void load();
    void load();
    return () => {
      controller.abort();
      loadRef.current = () => {};
    };
  }, [agendaId, apply]);

  // Recarrega quando chega um GROUP_MESSAGE novo. O primeiro valor observado (replay do canal) é só a linha de base.
  const groupSeq = React.useMemo(
    () => events.reduce((max, e) => (e.type === 'GROUP_MESSAGE' && e.seq > max ? e.seq : max), 0),
    [events],
  );
  React.useEffect(() => {
    const prev = prevGroupSeq.current;
    prevGroupSeq.current = groupSeq;
    if (prev !== null && groupSeq !== prev) loadRef.current();
  }, [groupSeq]);

  // Silêncio do grupo: a checagem roda no servidor dentro do GET; o cliente só o dispara no instante devido.
  const lastReal = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (!messages[i].id.startsWith(OPTIMISTIC_PREFIX)) return messages[i];
    return null;
  }, [messages]);
  const lastRealId = lastReal?.id ?? null;
  const authorId = author?.id ?? null;
  React.useEffect(() => {
    if (!stalemateEnabled || !authorId || !lastReal) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const at = nextStalemateCheckAt(lastReal, authorId, Date.now());
      if (at === null) return;
      timer = setTimeout(() => {
        loadRef.current();
        schedule();
      }, Math.max(0, at - Date.now()));
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage à troca da última mensagem real (id), não ao objeto
  }, [stalemateEnabled, authorId, lastRealId, agendaId]);

  const send = React.useCallback(
    async (content: string): Promise<boolean> => {
      const optimisticId = `${OPTIMISTIC_PREFIX}${Date.now()}`;
      if (author) {
        setMessages((prev) => [
          ...prev,
          {
            id: optimisticId,
            agendaId,
            authorId: author.id,
            authorName: author.name,
            isAi: false,
            content,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      setIsSending(true);
      try {
        const res = await fetch(messagesUrl(agendaId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.success) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          setError(typeof body?.error === 'string' ? body.error : SEND_ERROR);
          return false;
        }
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        apply([body.message as MessageDTO, ...(body.tutorReply ? [body.tutorReply as MessageDTO] : [])], false);
        setError(body.tutorUnavailable === true ? TUTOR_UNAVAILABLE_MESSAGE : null);
        return true;
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setError(SEND_ERROR);
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [agendaId, author, apply],
  );

  return { messages, isLoading, isSending, error, send };
}
