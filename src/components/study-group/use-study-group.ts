'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import { STUDY_GROUP_POLL_MS } from '@/lib/constants/tutor';
import type { MessageDTO } from '@/domains/agendas/services/study-group-service';

const LOAD_ERROR = 'Não foi possível carregar as mensagens do grupo.';
const SEND_ERROR = 'Não foi possível enviar a mensagem. Tente novamente.';
const OPTIMISTIC_PREFIX = 'pending-';

function messagesUrl(agendaId: string): string {
  return `${API_ROUTES.AGENDAS}/${encodeURIComponent(agendaId)}/messages`;
}

function mergeById(current: MessageDTO[], incoming: MessageDTO[]): MessageDTO[] {
  const seen = new Set(current.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  return added.length ? [...current, ...added] : current;
}

/** Mensagens do grupo de estudos com atualização periódica (polling) e envio otimista. */
export function useStudyGroupMessages(
  agendaId: string,
  author: { id: string; name: string } | null,
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

  const apply = React.useCallback((incoming: MessageDTO[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      // Mensagens reais substituem as otimistas equivalentes (mesmo autor e conteúdo).
      const real = new Set(incoming.map((m) => `${m.authorId}|${m.content}`));
      const cleaned = prev.filter((m) => !(m.id.startsWith(OPTIMISTIC_PREFIX) && real.has(`${m.authorId}|${m.content}`)));
      return mergeById(cleaned, incoming);
    });
    const newest = incoming[incoming.length - 1]?.createdAt;
    if (newest && (!lastCreatedAt.current || newest > lastCreatedAt.current)) lastCreatedAt.current = newest;
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    lastCreatedAt.current = null;
    setMessages([]);
    setIsLoading(true);

    async function load() {
      try {
        const since = lastCreatedAt.current ? `?since=${encodeURIComponent(lastCreatedAt.current)}` : '';
        const res = await fetch(`${messagesUrl(agendaId)}${since}`, { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (res.ok && body?.success) {
          apply(body.messages as MessageDTO[]);
          setError(null);
        } else {
          setError(typeof body?.error === 'string' ? body.error : LOAD_ERROR);
        }
      } catch {
        if (!controller.signal.aborted) setError(LOAD_ERROR);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    const timer = setInterval(() => void load(), STUDY_GROUP_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [agendaId, apply]);

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
        apply([body.message as MessageDTO, ...(body.tutorReply ? [body.tutorReply as MessageDTO] : [])]);
        setError(null);
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
