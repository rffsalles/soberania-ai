'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import {
  Users,
  MessageSquare,
  Sparkles,
  Bot,
  User,
  Send,
  FileCode2,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import { processAgentInteraction } from '@/domains/agents/agent-orchestrator';
import { cn } from '@/lib/utils';

interface StudyGroupPageProps {
  groupId: string;
}

interface PeerMessage {
  id: string;
  senderName: string;
  isAi: boolean;
  text: string;
  time: string;
}

export default function StudyGroupPage({ groupId }: StudyGroupPageProps) {
  const [boardContent, setBoardContent] = React.useState(
    `-- Quadro Compartilhado da Equipe: Desafio 3FN
-- Problema: Tabela de Pedidos não-normalizada
-- R(pedido_id, data, cliente_id, nome_cliente, endereco_cliente, valor_total)

-- Proposta de Decomposição:
-- 1. TABELA_CLIENTES (cliente_id [PK], nome_cliente, endereco_cliente)
-- 2. TABELA_PEDIDOS (pedido_id [PK], data, cliente_id [FK], valor_total)`
  );

  const [messages, setMessages] = React.useState<PeerMessage[]>([
    {
      id: 'm1',
      senderName: 'Beatriz Ramos',
      isAi: false,
      text: 'Pessoal, na tabela original, o nome e o endereço do cliente dependem apenas de cliente_id, e não do pedido_id!',
      time: '14:40',
    },
    {
      id: 'm2',
      senderName: 'Gabriel Souza',
      isAi: false,
      text: 'Exato, isso configura dependência transitiva. Então precisamos isolar a entidade Cliente em outra tabela.',
      time: '14:42',
    },
    {
      id: 'm3',
      senderName: 'Tutora Lucy (Mediação IA)',
      isAi: true,
      text: 'Excelente raciocínio, Beatriz e Gabriel! Como vocês garantiriam que o valor_total do pedido permaneça consistente sem violar a 3FN?',
      time: '14:43',
    },
  ]);

  const [inputMsg, setInputMsg] = React.useState('');
  const [isAiResponding, setIsAiResponding] = React.useState(false);

  const handleSendGroupMessage = async () => {
    if (!inputMsg.trim()) return;

    const userText = inputMsg;
    const newMsg: PeerMessage = {
      id: `usr-${Date.now()}`,
      senderName: 'Lucas Ferreira (Você)',
      isAi: false,
      text: userText,
      time: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputMsg('');

    // Trigger AI mediation if Tutora Lucy is mentioned or requested
    const lower = userText.toLowerCase();
    if (
      lower.includes('@lucy') ||
      lower.includes('@tutora') ||
      lower.includes('@luci') ||
      lower.includes('@professora') ||
      lower.includes('tutora')
    ) {
      setIsAiResponding(true);
      try {
        const response = await processAgentInteraction({
          userMessage: userText,
          agendaType: 'STUDY_GROUP',
        });

        const aiMsg: PeerMessage = {
          id: `ai-${Date.now()}`,
          senderName: 'Tutora Lucy (Mediação IA)',
          isAi: true,
          text: response.content,
          time: new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };

        setMessages((prev) => [...prev, aiMsg]);
      } finally {
        setIsAiResponding(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="indigo" className="gap-1">
                <Users className="h-3.5 w-3.5" />
                Grupo de Estudos Interativo
              </Badge>
              <span className="text-xs text-slate-500">Turma ADS-3A</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">|</span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                👨‍🏫 Prof. Responsável: <strong>Prof. Carlos Eduardo</strong>
              </span>
              <span className="text-xs text-slate-300 dark:text-slate-700">|</span>
              <span className="text-xs text-brand-teal font-medium">
                🤖 Mediação: <strong>Tutora Lucy</strong>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white">
              Desafio Prático: Normalização 3FN em Equipe
            </h1>
          </div>

          {/* Active Members */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              Membros na Sala:
            </span>
            <div className="flex -space-x-2">
              {['LF', 'BR', 'GS', 'PL'].map((initials, i) => (
                <Avatar
                  key={initials}
                  className={cn(
                    'h-8 w-8 ring-2 ring-white dark:ring-slate-900 font-semibold text-xs',
                    i === 3
                      ? 'bg-brand-teal text-white ring-brand-orange'
                      : 'bg-slate-200 text-slate-700'
                  )}
                >
                  <AvatarFallback>{initials}</AvatarFallback>
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
                      Quadro de Resolução Compartilhado (Sync em Tempo Real)
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono text-emerald-600 border-emerald-300">
                    Sincronizado
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <Textarea
                  value={boardContent}
                  onChange={(e) => setBoardContent(e.target.value)}
                  rows={14}
                  className="font-mono text-xs leading-relaxed bg-slate-950 text-emerald-400 border-slate-800 focus-visible:ring-brand-teal"
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Qualquer alteração é transmitida via WebSocket local para todos os membros da mesa.
                  </span>
                  <Button size="sm" className="gap-1.5 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Concluir Desafio</span>
                  </Button>
                </div>
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
              {messages.map((m) => (
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
                      {m.senderName}
                    </span>
                    <span className="text-[10px] text-slate-400">{m.time}</span>
                  </div>
                  <p className="leading-relaxed">{m.text}</p>
                </div>
              ))}

              {isAiResponding && (
                <div className="text-xs text-brand-teal animate-pulse flex items-center gap-1.5 p-2">
                  <Bot className="h-3.5 w-3.5" />
                  <span>Tutora Lucy está formulando uma intervenção mediadora sob coordenação docente...</span>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
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
                <Button type="submit" size="sm" className="bg-brand-teal hover:bg-brand-teal-dark text-white rounded-xl cursor-pointer">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
