'use client';

import * as React from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SCHEDULE_MEETINGS } from '@/lib/mocks-pending';


export default function CourseSchedulePage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Stepper */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 2 do Pipeline Pedagógico
            </Badge>
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              ✓ Etapa 1 Homologada
            </Badge>
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Cronograma de Aulas & Calendário Acadêmico Detalhado
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Desdobramento oficial do Plano de Ensino nas datas do semestre letivo 2025.1.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 text-xs rounded-xl">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sincronizar Calendário</span>
          </Button>
          <Button
            onClick={() => (window.location.href = '/teacher/lessons')}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl text-xs"
          >
            <span>Avançar para Planos de Aula (Etapa 3)</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500">Semanas Letivas</span>
          <p className="text-2xl font-bold font-heading text-slate-900 mt-1">20 Semanas</p>
          <span className="text-[11px] text-emerald-600">80h homologadas MEC</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500">Total de Encontros</span>
          <p className="text-2xl font-bold font-heading text-slate-900 mt-1">40 Aulas</p>
          <span className="text-[11px] text-brand-teal">24 Teóricas / 12 Práticas / 4 Provas</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500">Feriados Compensados</span>
          <p className="text-2xl font-bold font-heading text-slate-900 mt-1">3 Recessos</p>
          <span className="text-[11px] text-amber-600">Calculado sem perda de carga</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500">Acervo RAG Indexado</span>
          <p className="text-2xl font-bold font-heading text-slate-900 mt-1">36 de 40 Aulas</p>
          <span className="text-[11px] text-emerald-600">100% On-Premises</span>
        </div>
      </div>

      {/* Main Timeline Schedule */}
      <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-brand-teal" />
              Linha do Tempo de Encontros Curriculares
            </span>
            <Badge variant="secondary" className="text-xs">
              Arraste para reordenar
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SCHEDULE_MEETINGS.map((item) => (
            <div
              key={item.num}
              className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-brand-teal/40 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal font-bold text-xs">
                  #{item.num}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">{item.date}</span>
                    <Badge
                      className={
                        item.type === 'Feriado'
                          ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]'
                          : item.type === 'Avaliação P1'
                          ? 'bg-rose-500/10 text-rose-600 border-rose-500/20 text-[10px]'
                          : 'bg-brand-teal/10 text-brand-teal border-brand-teal/20 text-[10px]'
                      }
                    >
                      {item.type}
                    </Badge>
                  </div>
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-white mt-0.5">
                    {item.title}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end md:self-auto">
                <span className="text-xs text-emerald-600 font-medium">{item.ragStatus}</span>
                <Button variant="ghost" size="sm" className="text-xs text-brand-teal cursor-pointer">
                  Detalhar Plano (Etapa 3)
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
