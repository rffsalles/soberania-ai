'use client';

import * as React from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/app-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { PedagogicalMinutesModal } from '@/components/classroom/pedagogical-minutes-modal';
import { getMockAgendas } from '@/domains/agendas/agenda-service';
import { getMockMinutesFeed } from '@/domains/pedagogy/minutes-generator';
import {
  Calendar,
  Video,
  Users,
  FileCheck2,
  Clock,
  Sparkles,
  BookOpen,
  Award,
  ArrowRight,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const [selectedMinuteAgenda, setSelectedMinuteAgenda] = React.useState<string | null>(null);
  const agendas = getMockAgendas();
  const minutesHistory = getMockMinutesFeed();

  const getAgendaIcon = (type: string) => {
    switch (type) {
      case 'CLASSROOM':
        return Video;
      case 'STUDY_GROUP':
        return Users;
      case 'EXAM':
        return FileCheck2;
      default:
        return BookOpen;
    }
  };

  const getAgendaLink = (id: string, type: string) => {
    switch (type) {
      case 'CLASSROOM':
        return `/classroom/${id}`;
      case 'STUDY_GROUP':
        return `/study-group/${id}`;
      case 'EXAM':
        return `/exam/${id}`;
      default:
        return `/classroom/${id}`;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Header with Multi-Agendas Summary */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-brand-teal via-brand-teal-dark to-slate-900 text-white shadow-md">
          <div className="space-y-1.5">
            <Badge className="bg-white/20 hover:bg-white/25 text-white border-0 text-xs font-semibold backdrop-blur-xs">
              Semestre Letivo 2026.2 · Turma ADS-3A
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-bold font-heading">
              Bem-vindo, Lucas Ferreira!
            </h1>
            <p className="text-sm text-teal-100 max-w-xl">
              Você possui <strong>1 Aula Síncrona AO VIVO</strong> e <strong>1 Grupo de Estudos Ativo</strong> agendados para hoje.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/classroom/session-live-01">
              <Button size="lg" className="bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold cursor-pointer shadow-lg">
                <Sparkles className="h-4 w-4 mr-2" />
                Entrar na Aula Agora
              </Button>
            </Link>
          </div>
        </div>

        {/* Metrics Quick Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Aulas Concluídas</p>
                <h3 className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
                  14 / 20
                </h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-brand-teal/10 flex items-center justify-center text-brand-teal">
                <Video className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Média de Engajamento</p>
                <h3 className="text-2xl font-bold font-heading text-emerald-600 dark:text-emerald-400 mt-1">
                  91.8%
                </h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Dúvidas Socráticas</p>
                <h3 className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
                  38 Enviadas
                </h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange">
                <Sparkles className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Atas Homologadas</p>
                <h3 className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
                  14 Emitidas
                </h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                <FileText className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 1: Multi-Agendas Sessions Carousel/Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-brand-teal" />
              <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                Sua Grade de Multi-Agendas Hoje
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {agendas.map((agenda) => {
              const Icon = getAgendaIcon(agenda.type);
              const isLive = agenda.status === 'LIVE';

              return (
                <Card
                  key={agenda.id}
                  className={cn(
                    'rounded-2xl border transition-all hover:shadow-md flex flex-col justify-between',
                    isLive
                      ? 'border-brand-orange/50 bg-white dark:bg-slate-900 shadow-soft-sm'
                      : 'border-slate-200 dark:border-slate-800'
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={isLive ? 'amber' : 'secondary'}
                        className="text-xs font-semibold"
                      >
                        {isLive ? 'SESSÃO AO VIVO' : 'AGENDADA'}
                      </Badge>
                      <span className="text-xs text-slate-500 font-medium">
                        {agenda.subject}
                      </span>
                    </div>

                    <div className="flex items-start gap-3 pt-2">
                      <div className={cn('p-2 rounded-xl shrink-0', isLive ? 'bg-brand-orange/10 text-brand-orange' : 'bg-slate-100 text-slate-600')}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold leading-snug">
                          {agenda.title}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {agenda.instructorName}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 font-mono">
                        <Clock className="h-3.5 w-3.5 text-brand-teal" />
                        <span>Janela de 90 min</span>
                      </div>

                      <Link href={getAgendaLink(agenda.id, agenda.type)}>
                        <Button
                          size="sm"
                          variant={isLive ? 'default' : 'outline'}
                          className={cn(
                            'text-xs h-8 cursor-pointer gap-1',
                            isLive && 'bg-brand-teal hover:bg-brand-teal-dark text-white'
                          )}
                        >
                          <span>Entrar</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Section 2: Historical Pedagogical Minutes Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-brand-orange" />
              <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                Histórico de Atas Pedagógicas Homologadas
              </h2>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aula / Sessão</TableHead>
                  <TableHead>Engajamento</TableHead>
                  <TableHead>Pontos Fortes</TableHead>
                  <TableHead>Recomendação</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {minutesHistory.map((m) => (
                  <TableRow
                    key={m.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedMinuteAgenda(m.agendaId)}
                  >
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      <div>
                        <p>{m.sessionTitle}</p>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-emerald-600 font-mono">
                          {m.engagementScore}%
                        </span>
                        <Progress value={m.engagementScore} className="w-16 h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {m.topicsMastered.slice(0, 2).map((t) => (
                          <Badge key={t} variant="teal" className="text-[10px] py-0">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {m.actionableAdvice}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-brand-teal hover:text-brand-teal-dark cursor-pointer gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMinuteAgenda(m.agendaId);
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Ver Ata</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      {/* Ata Modal Viewer */}
      <PedagogicalMinutesModal
        open={Boolean(selectedMinuteAgenda)}
        onOpenChange={(open) => !open && setSelectedMinuteAgenda(null)}
        agendaId={selectedMinuteAgenda || 'session-live-01'}
      />
    </div>
  );
}
