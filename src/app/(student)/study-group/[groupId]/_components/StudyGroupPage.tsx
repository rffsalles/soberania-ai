'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Users, MessageSquare, Bot, Send, FileCode2 } from 'lucide-react';
import { useAgenda } from '@/components/agendas/use-agenda';
import { useStudyGroupMessages } from '@/components/study-group/use-study-group';
import { useCurrentUser } from '@/components/layout/use-current-user';
import { validateAgendaTimeWindow, deriveAgendaStatus } from '@/domains/agendas/agenda-validator';
import type { AgendaSession } from '@/domains/agendas/types';
import { TUTOR_DISPLAY_NAME } from '@/lib/constants/tutor';
import { cn } from '@/lib/utils';
import { INSTITUTION_TIMEZONE } from '@/lib/constants/teaching';

interface StudyGroupPageProps {
  groupId: string;
}

const SELF_LABEL = 'Você';
const MAX_AVATARS = 4;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: INSTITUTION_TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

export default function StudyGroupPage({ groupId }: StudyGroupPageProps) {
  const { agenda, isLoading: agendaLoading, error: agendaError, notFound } = useAgenda(groupId);
  const { user } = useCurrentUser();
  const author = React.useMemo(() => (user ? { id: user.id, name: user.name } : null), [user]);
  const windowState = agenda ? validateAgendaTimeWindow(agenda as unknown as AgendaSession) : null;
  const isOpen = windowState?.isWithinWindow ?? false;

  // A janela de envio (isOpen) segue só o horário e continua aberta após o professor encerrar (COMPLETED); a checagem de silêncio só faz sentido com a aula LIVE.
  const isLive = agenda ? deriveAgendaStatus(agenda) === 'LIVE' : false;

  const { messages, isSending, error, send } = useStudyGroupMessages(groupId, author, { stalemateEnabled: isLive });

  const [boardContent, setBoardContent] = React.useState('');
  const [inputMsg, setInputMsg] = React.useState('');
  const listEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    listEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length]);

  const members = React.useMemo(() => {
    const names = new Set<string>();
    for (const m of messages) if (!m.isAi && m.authorName) names.add(m.authorName);
    return [...names].slice(0, MAX_AVATARS);
  }, [messages]);

  const handleSendGroupMessage = async () => {
    const content = inputMsg.trim();
    if (!content || isSending) return;
    setInputMsg('');
    const ok = await send(content);
    if (!ok) setInputMsg(content);
  };

  if (agendaLoading) {
    return (
      <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
        <main className="mx-auto w-full px-4 py-10 text-sm text-slate-500">Carregando grupo de estudos...</main>
      </div>
    );
  }

  if (!agenda || notFound) {
    return (
      <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
        <main className="mx-auto w-full px-4 py-10 text-sm text-slate-600">
          {notFound ? 'Grupo de estudos não encontrado.' : (agendaError ?? 'Não foi possível carregar o grupo de estudos.')}
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">

      <main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="indigo" className="gap-1">
                <Users className="h-3.5 w-3.5" />
                Grupo de Estudos Interativo
              </Badge>
              <span className="text-xs text-slate-500">{agenda.className}</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">|</span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                👨‍🏫 Prof. Responsável: <strong>{agenda.teacherName}</strong>
              </span>
              <span className="text-xs text-slate-300 dark:text-slate-700">|</span>
              <span className="text-xs text-brand-teal font-medium">
                🤖 Mediação: <strong>{TUTOR_DISPLAY_NAME}</strong>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white">
              {agenda.title}
            </h1>
          </div>

          {/* Active Members */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              Membros na Sala:
            </span>
            <div className="flex -space-x-2">
              {members.map((name) => (
                <Avatar
                  key={name}
                  title={name}
                  className="h-8 w-8 ring-2 ring-white dark:ring-slate-900 font-semibold text-xs bg-slate-200 text-slate-700"
                >
                  <AvatarFallback>{initialsOf(name)}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>
        </div>

        {/* 2-Column Work Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Shared Board (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-5 w-5 text-brand-teal" />
                    <CardTitle className="text-base">
                      Quadro de Rascunho
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono text-emerald-600 border-emerald-300">
                    Rascunho local
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <Textarea
                  value={boardContent}
                  onChange={(e) => setBoardContent(e.target.value)}
                  rows={14}
                  placeholder="Use este quadro para rascunhar a solução antes de discutir com a equipe."
                  className="font-mono text-xs leading-relaxed bg-slate-950 text-emerald-400 border-slate-800 focus-visible:ring-brand-teal"
                />

                <p className="text-xs text-slate-500">Este quadro é pessoal e não é compartilhado com a equipe.</p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Group Chat with Tutora Lucy Mediation (5 cols) */}
          <div className="lg:col-span-5 h-[580px] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-brand-teal" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Chat da Equipe & Mediação IA
                </h4>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                Marque @lucy ou @tutora para ajuda
              </Badge>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isSelf = !m.isAi && m.authorId === user?.id;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'p-3 rounded-xl text-xs space-y-1',
                      m.isAi
                        ? 'bg-brand-teal/10 border border-brand-teal/20 text-slate-800 dark:text-slate-200'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn('font-bold', m.isAi ? 'text-brand-teal flex items-center gap-1' : 'text-slate-700 dark:text-slate-300')}>
                        {m.isAi && <Bot className="h-3.5 w-3.5" />}
                        {isSelf ? SELF_LABEL : m.authorName}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatTime(m.createdAt)}</span>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <p className="text-xs text-slate-500">Nenhuma mensagem ainda. Comece a discussão com a equipe.</p>
              )}
              <div ref={listEndRef} />
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
              {isOpen ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendGroupMessage();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    placeholder="Escreva para a equipe ou chame @lucy ou @tutora..."
                    className="rounded-xl text-xs"
                  />
                  <Button type="submit" size="sm" disabled={isSending} className="bg-brand-teal hover:bg-brand-teal-dark text-white rounded-xl cursor-pointer">
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-slate-500">{windowState?.message}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
