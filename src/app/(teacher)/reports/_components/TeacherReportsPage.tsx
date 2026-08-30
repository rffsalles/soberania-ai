'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getTeacherStruggleHeatmap } from '@/domains/pedagogy/struggle-analyzer';
import { getMockMinutesFeed } from '@/domains/pedagogy/minutes-generator';
import {
  BarChart3,
  Flame,
  Lightbulb,
  FileCheck2,
  Users,
  Calendar,
  Sparkles,
  Download,
  Printer,
  ChevronRight,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TeacherReportsPage() {
  const heatmap = getTeacherStruggleHeatmap();
  const minutesFeed = getMockMinutesFeed();

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="teal" className="gap-1 text-xs">
                <BarChart3 className="h-3.5 w-3.5" />
                Painel Pedagógico Docente
              </Badge>
              <span className="text-xs text-slate-500">Turma ADS-3A (35 Alunos)</span>
            </div>
            <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white">
              Diagnóstico de Dificuldades & Atas Pedagógicas
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Análise sintética gerada em tempo real pela Profª. Luci Virtual a partir das sessões de aula e grupo de estudos.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
              <Printer className="h-4 w-4" />
              <span>Imprimir Relatório</span>
            </Button>
            <Button size="sm" className="gap-1.5 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer">
              <Download className="h-4 w-4" />
              <span>Exportar CSV</span>
            </Button>
          </div>
        </div>

        {/* Section 1: Mapa de Calor de Dificuldades (Heatmap) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-brand-orange" />
              <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                Mapa de Calor: Onde a Turma Mais Hesitou
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              Ordenado por índice de dúvida e tempo de resposta
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {heatmap.map((item, idx) => (
              <Card
                key={item.topic}
                className={cn(
                  'rounded-2xl border transition-all',
                  idx === 0
                    ? 'border-brand-orange/40 bg-brand-orange/5 dark:bg-brand-orange/10'
                    : 'border-slate-200 dark:border-slate-800'
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white leading-snug">
                      {item.topic}
                    </span>
                    <Badge
                      variant={item.strugglePercentage > 40 ? 'amber' : 'secondary'}
                      className="font-mono text-xs"
                    >
                      {item.strugglePercentage}% da turma
                    </Badge>
                  </div>
                  <div className="pt-2">
                    <Progress
                      value={item.strugglePercentage}
                      className={cn('h-2', item.strugglePercentage > 40 ? 'bg-amber-100' : 'bg-slate-100')}
                    />
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5">
                    <span className="font-semibold text-brand-teal flex items-center gap-1.5">
                      <Lightbulb className="h-4 w-4 text-brand-orange" />
                      Intervenção Pedagógica Recomendada:
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.suggestedAction}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Section 2: Feed Recente de Atas Individuais */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-brand-teal" />
              <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                Feed de Atas Homologadas da Última Aula
              </h2>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estudante</TableHead>
                  <TableHead>Engajamento</TableHead>
                  <TableHead>Hesitação</TableHead>
                  <TableHead>Pontos de Atenção</TableHead>
                  <TableHead>Parecer Sintético da Profª. Luci</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {minutesFeed.map((m) => (
                  <TableRow key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <TableCell className="font-semibold text-slate-900 dark:text-white">
                      {m.studentName}
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-xs text-emerald-600 font-mono">
                        {m.engagementScore}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-xs text-amber-600 font-mono">
                        {m.hesitationIndex}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {m.topicsStruggled.length > 0 ? (
                          m.topicsStruggled.map((t) => (
                            <Badge key={t} variant="amber" className="text-[10px] py-0">
                              {t}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="teal" className="text-[10px] py-0">
                            Nenhuma hesitação crítica
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 max-w-sm">
                      {m.rawSummary}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
