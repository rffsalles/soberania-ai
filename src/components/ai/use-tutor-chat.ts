'use client';

import * as React from 'react';
import { createParser } from 'eventsource-parser';
import { API_ROUTES } from '@/lib/constants/routes';
import { CHAT_HISTORY_LIMIT, SSE_EVENT } from '@/lib/constants/chat';

export interface ChatMessage {
  id: string;
  sender: 'student' | 'teacher';
  text: string;
  citation?: string;
  attachment?: { type: 'audio' | 'image'; url: string; name?: string };
  isGuardrailViolation?: boolean;
  fallback?: boolean;
  failed?: boolean;
  timestamp: string;
}

interface DonePayload {
  reply: string;
  citations?: string[];
  blockedByExamGuardrail?: boolean;
  fallback?: boolean;
}

const STREAM_ERROR_TEXT = 'Desculpe, a resposta foi interrompida. Por favor, tente novamente.';
const REQUEST_ERROR_TEXT = 'Não foi possível enviar a mensagem. Tente novamente.';

const now = () =>
  new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;

export function useTutorChat({
  agendaId,
  initialMessages = [],
}: {
  agendaId: string;
  initialMessages?: ChatMessage[];
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;

  const patch = React.useCallback((id: string, changes: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }, []);

  const send = React.useCallback(
    async (text: string, attachment?: ChatMessage['attachment']) => {
      const message = text.trim();
      if (!message) return;

      const history = messagesRef.current
        .filter((m) => !m.failed && m.text)
        .slice(-CHAT_HISTORY_LIMIT)
        .map((m) => ({
          role: m.sender === 'student' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        }));

      const pendingId = nextId('teacher');
      setError(null);
      setIsStreaming(true);
      setMessages((prev) => [
        ...prev,
        { id: nextId('student'), sender: 'student', text: message, attachment, timestamp: now() },
        { id: pendingId, sender: 'teacher', text: '', timestamp: now() },
      ]);

      const dropPending = () => setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      const fail = () => patch(pendingId, { text: STREAM_ERROR_TEXT, failed: true });

      let streamed = '';
      const parser = createParser({
        onEvent(event) {
          if (event.event === SSE_EVENT.TOKEN) {
            streamed += (JSON.parse(event.data) as { token: string }).token;
            patch(pendingId, { text: streamed });
          } else if (event.event === SSE_EVENT.DONE) {
            const done = JSON.parse(event.data) as DonePayload;
            patch(pendingId, {
              text: done.reply,
              citation: done.citations?.[0],
              isGuardrailViolation: done.blockedByExamGuardrail,
              fallback: done.fallback,
            });
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
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          dropPending();
          setError((data as { error?: string } | null)?.error ?? REQUEST_ERROR_TEXT);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
      } catch {
        fail();
      } finally {
        setIsStreaming(false);
      }
    },
    [agendaId, patch]
  );

  const reset = React.useCallback(() => {
    setMessages(initialMessages);
    setError(null);
  }, [initialMessages]);

  return { messages, send, isStreaming, error, reset };
}
