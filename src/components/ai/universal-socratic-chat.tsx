'use client';

import * as React from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { AgendaType } from '@/domains/agendas/types';
import { ChatMessageList } from './chat-message-list';
import { ChatComposer } from './chat-composer';
import { useTutorChat, type ChatMessage } from './use-tutor-chat';
import { INSTITUTION_TIMEZONE } from '@/lib/constants/teaching';
import { API_ROUTES } from '@/lib/constants/routes';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChatHistoryItem } from '@/domains/agents/services/chat-history-service';

export interface UniversalSocraticChatProps {
  agendaId: string;
  agendaType: AgendaType;
  placeholder?: string;
  suggestions?: string[];
  onOpenMinutesModal?: () => void;
  onGuardrailBlock?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
}

const GREETINGS = {
  CLASSROOM: 'Olá! Sou a Tutora Lucy. Pergunte sobre a aula de hoje.',
  STUDY_GROUP: 'Olá! Sou a Tutora Lucy. Posso apoiar as discussões do seu grupo de estudos.',
  EXAM: 'Olá! Sou a Tutora Lucy. Durante a avaliação, ofereço apenas apoio conceitual, sem entregar respostas.',
  DRAFT_REVIEW: 'Olá! Sou a Tutora Lucy. Compartilhe seu rascunho e vamos refletir sobre ele juntos.',
  OFFICE_HOURS: 'Olá! Sou a Tutora Lucy. Tire suas dúvidas para este atendimento.',
} as const satisfies Record<AgendaType, string>;

const WINDOW_CLOSED_TITLE = 'Chat indisponível';

const formatTime = (date: Date) =>
  date.toLocaleTimeString('pt-BR', { timeZone: INSTITUTION_TIMEZONE, hour: '2-digit', minute: '2-digit' });

function historyToMessages(items: ChatHistoryItem[]): ChatMessage[] {
  return items.flatMap((item) => {
    const timestamp = formatTime(new Date(item.createdAt));
    return [
      { id: `${item.id}-q`, sender: 'student', text: item.question, timestamp },
      {
        id: `${item.id}-a`,
        sender: 'teacher',
        text: item.answer,
        timestamp,
        ...(item.citation ? { citation: item.citation } : {}),
        ...(item.guardrailBlocked ? { isGuardrailViolation: true } : {}),
      },
    ] satisfies ChatMessage[];
  });
}

const ROOT_CLASS =
  'flex flex-col h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden';

/** Carrega o histórico da agenda e só então monta o chat com as mensagens restauradas. */
export function UniversalSocraticChat(props: UniversalSocraticChatProps) {
  const { agendaId, className } = props;
  const [history, setHistory] = React.useState<ChatMessage[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setHistory(null);
    (async () => {
      try {
        const res = await fetch(API_ROUTES.AGENDA_INTERACTIONS(agendaId));
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items?: ChatHistoryItem[] };
        if (!cancelled) setHistory(historyToMessages(data.items ?? []));
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agendaId]);

  if (history === null) {
    return (
      <div className={cn(ROOT_CLASS, className)} aria-busy="true">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
    );
  }
  return <SocraticChatBody key={agendaId} {...props} restored={history} />;
}

function SocraticChatBody({
  restored,
  agendaId,
  agendaType,
  placeholder,
  suggestions,
  onOpenMinutesModal,
  onGuardrailBlock,
  className,
  title = 'Tutora Lucy Virtual',
  subtitle = 'Apoio Socrático Multimodal · On-Premises',
}: UniversalSocraticChatProps & { restored: ChatMessage[] }) {
  const greeting = React.useMemo<ChatMessage[]>(
    () => [
      {
        id: 'greeting',
        synthetic: true,
        sender: 'teacher',
        text: GREETINGS[agendaType],
        timestamp: formatTime(new Date()),
      },
      ...restored,
    ],
    [agendaType, restored]
  );
  const { messages, send, isStreaming, error } = useTutorChat({
    agendaId,
    initialMessages: greeting,
    onGuardrailBlock,
  });

  return (
    <div className={cn(ROOT_CLASS, className)}>
      <div className="flex items-start justify-between gap-3 p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative">
            <Avatar className="h-8 w-8 ring-2 ring-brand-orange ring-offset-2">
              <AvatarFallback className="bg-brand-teal text-white font-bold">TL</AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="leading-tight font-heading font-semibold text-sm text-slate-900 dark:text-white">
                {title}
              </h4>
              <Badge variant="secondary" className="text-[10px] py-0 bg-brand-teal/10 text-brand-teal">
                Multimodal Socrático
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>

        {onOpenMinutesModal && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenMinutesModal}
            className="text-xs h-8 shrink-0 gap-1.5 border-brand-teal/40 text-brand-teal hover:bg-brand-teal/10 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ver Ata Pedagógica</span>
          </Button>
        )}
      </div>

      <ChatMessageList messages={messages} isStreaming={isStreaming} />

      {error ? (
        <div role="alert" className="p-4 border-t border-slate-200 dark:border-slate-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold">{WINDOW_CLOSED_TITLE}</p>
          <p>{error}</p>
        </div>
      ) : (
        <ChatComposer
          onSend={send}
          disabled={isStreaming}
          placeholder={placeholder}
          suggestions={suggestions}
        />
      )}
    </div>
  );
}
