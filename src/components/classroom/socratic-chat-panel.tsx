'use client';

import * as React from 'react';
import {
  Send,
  Sparkles,
  BookOpen,
  Bot,
  User,
  RotateCcw,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { processAgentInteraction } from '@/domains/agents/agent-orchestrator';
import type { AgendaType } from '@/domains/agendas/types';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  sender: 'student' | 'teacher';
  text: string;
  citation?: string;
  isGuardrailViolation?: boolean;
  timestamp: string;
}

interface SocraticChatPanelProps {
  agendaType?: AgendaType;
  sessionId?: string;
  onOpenMinutesModal?: () => void;
  className?: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'teacher',
    text: 'Olá! Sou a Tutora Lucy, assistente virtual de tutoria socrática em apoio ao Professor Responsável. Durante a aula, faremos pausas reflexivas para aprofundar seu raciocínio. Como posso apoiar seu aprendizado agora?',
    citation: '[Sistemas de Banco de Dados · Cap. 4, pág. 58]',
    timestamp: '14:32',
  },
];

const SUGGESTIONS = [
  'Qual a diferença entre INNER e LEFT JOIN?',
  'Como a 3ª Forma Normal previne anomalias?',
  'O que é o isolamento ACID?',
];

export function SocraticChatPanel({
  agendaType = 'CLASSROOM',
  sessionId = 'session-live-01',
  onOpenMinutesModal,
  className,
}: SocraticChatPanelProps) {
  const [messages, setMessages] =
    React.useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = textToSend || input;
    if (!messageContent.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'student',
      text: messageContent,
      timestamp: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageContent,
          agendaType,
          sessionId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Falha na resposta do servidor.');
      }

      const teacherMsg: ChatMessage = {
        id: `teacher-${Date.now()}`,
        sender: 'teacher',
        text: data.reply,
        citation: data.citations?.[0],
        isGuardrailViolation: data.blockedByExamGuardrail,
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, teacherMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `teacher-err-${Date.now()}`,
        sender: 'teacher',
        text: 'Desculpe, ocorreu uma oscilação na conexão com o motor de inferência local. Por favor, tente novamente.',
        timestamp: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10 ring-2 ring-brand-orange ring-offset-2">
              <AvatarFallback className="bg-brand-teal text-white font-bold">
                TL
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
                Tutora Lucy Virtual
              </h4>
              <Badge variant="secondary" className="text-[10px] py-0">
                Tutoria IA
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Apoio Pedagógico ao Docente · On-Premises
            </p>
          </div>
        </div>

        {onOpenMinutesModal && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenMinutesModal}
            className="text-xs h-8 gap-1.5 border-brand-teal/40 text-brand-teal hover:bg-brand-teal/10 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Gerar Ata Pedagógica</span>
          </Button>
        )}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isTeacher = msg.sender === 'teacher';
          return (
            <div
              key={msg.id}
              className={cn(
                'flex gap-3 max-w-[85%]',
                isTeacher ? 'mr-auto' : 'ml-auto flex-row-reverse'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isTeacher
                    ? 'bg-brand-teal text-white'
                    : 'bg-brand-orange text-white'
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
                      : 'bg-brand-teal text-white'
                  )}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* RAG Citation Chip */}
                  {msg.citation && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5 text-xs text-brand-teal dark:text-brand-teal-light font-medium">
                      <BookOpen className="h-3.5 w-3.5 shrink-0" />
                      <span>{msg.citation}</span>
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    'text-[10px] text-slate-400 px-1',
                    isTeacher ? 'text-left' : 'text-right'
                  )}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-2 text-xs text-slate-400 p-2 animate-pulse">
            <Bot className="h-4 w-4 text-brand-teal" />
            <span>Tutora Lucy está consultando o material didático e formulando uma reflexão...</span>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-brand-orange" />
          Sugestões:
        </span>
        {SUGGESTIONS.map((sug) => (
          <button
            key={sug}
            onClick={() => handleSendMessage(sug)}
            className="text-xs shrink-0 rounded-lg px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-teal hover:text-brand-teal transition-colors cursor-pointer"
          >
            {sug}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua dúvida ou responda à pausa socrática..."
            className="flex-1 rounded-xl"
            disabled={isTyping}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="rounded-xl px-4 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
