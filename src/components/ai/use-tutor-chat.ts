'use client';

import * as React from 'react';
import { createParser } from 'eventsource-parser';
import { API_ROUTES } from '@/lib/constants/routes';
import { CHAT_HISTORY_LIMIT, SSE_EVENT } from '@/lib/constants/chat';
import { INSTITUTION_TIMEZONE } from '@/lib/constants/teaching';

export interface ChatMessage {
  id: string;
  sender: 'student' | 'teacher';
  text: string;
  citation?: string;
  attachment?: { type: 'audio' | 'image'; url: string; name?: string };
  isGuardrailViolation?: boolean;
  fallback?: boolean;
  failed?: boolean;
  /** Mensagem gerada no cliente (ex.: saudação); nunca enviada no history. */
  synthetic?: boolean;
  timestamp: string;
}

interface DonePayload {
  reply: string;
  citations?: string[];
  blockedByExamGuardrail?: boolean;
  fallback?: boolean;
}

const STREAM_ERROR_TEXT = 'A resposta foi interrompida. Tente novamente.';
const WINDOW_CLOSED_STATUS = 422;
const REQUEST_ERROR_TEXT = 'Não foi possível enviar a mensagem. Tente novamente.';

const now = () =>
  new Date().toLocaleTimeString('pt-BR', { timeZone: INSTITUTION_TIMEZONE, hour: '2-digit', minute: '2-digit' });

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;

export function useTutorChat({
  agendaId,
  initialMessages = [],
  onGuardrailBlock,
  onReplyDone,
}: {
  agendaId: string;
  initialMessages?: ChatMessage[];
  onGuardrailBlock?: () => void;
  /** Chamado uma vez ao fim de cada resposta concluída (evento done); não em erro. */
  onReplyDone?: () => void;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;
  const controllerRef = React.useRef<AbortController | null>(null);
  const isSendingRef = React.useRef(false);
  const onGuardrailBlockRef = React.useRef(onGuardrailBlock);
  onGuardrailBlockRef.current = onGuardrailBlock;
  const onReplyDoneRef = React.useRef(onReplyDone);
  onReplyDoneRef.current = onReplyDone;

  React.useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  const patch = React.useCallback((id: string, changes: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }, []);

  const send = React.useCallback(
    async (text: string, attachment?: ChatMessage['attachment']) => {
      const message = text.trim();
      if (!message || isSendingRef.current) return;
      isSendingRef.current = true;

      const all = messagesRef.current;
      // Par pergunta/recusa do guardrail da prova nunca volta ao servidor como contexto.
      const blocked = new Set<string>();
      all.forEach((m, i) => {
        if (!m.isGuardrailViolation) return;
        blocked.add(m.id);
        const question = all[i - 1];
        if (question?.sender === 'student') blocked.add(question.id);
      });
      const history = all
        .filter((m) => !m.failed && !m.synthetic && m.text && !blocked.has(m.id))
        .slice(-CHAT_HISTORY_LIMIT)
        .map((m) => ({
          role: m.sender === 'student' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        }));

      const controller = new AbortController();
      controllerRef.current = controller;
      const pendingId = nextId('teacher');
      setError(null);
      setIsStreaming(true);
      setMessages((prev) => [
        ...prev,
        { id: nextId('student'), sender: 'student', text: message, attachment, timestamp: now() },
        { id: pendingId, sender: 'teacher', text: '', timestamp: now() },
      ]);

      let finalized = false;
      const fail = (text = STREAM_ERROR_TEXT) => {
        finalized = true;
        patch(pendingId, { text, failed: true });
      };

      let streamed = '';
      const parser = createParser({
        onEvent(event) {
          if (controller.signal.aborted) return;
          if (event.event === SSE_EVENT.TOKEN) {
            streamed += (JSON.parse(event.data) as { token: string }).token;
            patch(pendingId, { text: streamed });
          } else if (event.event === SSE_EVENT.DONE) {
            finalized = true;
            const done = JSON.parse(event.data) as DonePayload;
            if (done.blockedByExamGuardrail) onGuardrailBlockRef.current?.();
            patch(pendingId, {
              text: done.reply,
              citation: done.citations?.[0],
              isGuardrailViolation: done.blockedByExamGuardrail,
              fallback: done.fallback,
            });
            onReplyDoneRef.current?.();
          } else if (event.event === SSE_EVENT.ERROR) {
            fail();
          }
        },
      });

      try {
        const res = await fetch(API_ROUTES.AGENT_CHAT_STREAM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agendaId, message, history }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (controller.signal.aborted) return;
          if (res.status === WINDOW_CLOSED_STATUS) {
            setMessages((prev) => prev.filter((m) => m.id !== pendingId));
            setError(data?.error ?? REQUEST_ERROR_TEXT);
          } else {
            fail(data?.error ?? REQUEST_ERROR_TEXT);
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
        if (!finalized && !controller.signal.aborted) fail();
      } catch {
        if (!controller.signal.aborted) fail();
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          isSendingRef.current = false;
          if (!controller.signal.aborted) setIsStreaming(false);
        }
      }
    },
    [agendaId, patch]
  );

  const reset = React.useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    isSendingRef.current = false;
    setIsStreaming(false);
    setMessages(initialMessages);
    setError(null);
  }, [initialMessages]);

  return { messages, send, isStreaming, error, reset };
}
