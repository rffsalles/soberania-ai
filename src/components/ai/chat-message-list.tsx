'use client';

import * as React from 'react';
import { BookOpen, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './use-tutor-chat';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function ChatMessageList({ messages, isStreaming }: ChatMessageListProps) {
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const lastMessage = messages[messages.length - 1];
  const waitingFirstToken = isStreaming && lastMessage?.sender === 'teacher' && !lastMessage.text;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages
        .filter((msg) => msg.text || msg.attachment)
        .map((msg) => {
          const isTeacher = msg.sender === 'teacher';
          return (
            <div
              key={msg.id}
              className={cn('flex gap-3 max-w-[85%]', isTeacher ? 'mr-auto' : 'ml-auto flex-row-reverse')}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isTeacher ? 'bg-brand-teal text-white' : 'bg-brand-orange text-white'
                )}
              >
                {isTeacher ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>

              <div className="space-y-1.5">
                <div
                  className={cn(
                    'rounded-2xl p-4 text-sm leading-relaxed shadow-soft-sm',
                    isTeacher
                      ? 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                      : 'bg-brand-teal text-white',
                    (msg.isGuardrailViolation || msg.fallback) && 'border-amber-300 bg-amber-50 dark:bg-amber-950/30',
                    msg.failed && 'border-rose-300 bg-rose-50 dark:bg-rose-950/30'
                  )}
                >
                  {msg.attachment && (
                    <div className="mb-3 p-2 rounded-lg bg-black/10 dark:bg-white/10 space-y-2">
                      {msg.attachment.type === 'image' && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={msg.attachment.url}
                          alt="Anexo de imagem"
                          className="max-h-48 rounded-md object-contain"
                        />
                      )}
                      {msg.attachment.type === 'audio' && (
                        <audio controls src={msg.attachment.url} className="w-full h-8" />
                      )}
                    </div>
                  )}

                  {msg.fallback && (
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Tutora indisponível
                    </p>
                  )}
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {msg.citation && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5 text-xs text-brand-teal dark:text-brand-teal-light font-medium">
                      <BookOpen className="h-3.5 w-3.5 shrink-0" />
                      <span>{msg.citation}</span>
                    </div>
                  )}
                </div>

                <div
                  className={cn('text-[10px] text-slate-400 px-1', isTeacher ? 'text-left' : 'text-right')}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

      {waitingFirstToken && (
        <div className="flex items-center gap-2 text-xs text-slate-400 p-2 animate-pulse">
          <Bot className="h-4 w-4 text-brand-teal" />
          <span>Tutora Lucy está formulando uma reflexão...</span>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
