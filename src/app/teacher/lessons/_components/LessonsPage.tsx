'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTeacherPlans } from '@/components/assessments/use-assessments';
import { useSchedules, type ScheduleItem } from '@/components/teaching/use-schedules';
import { useLessons, type LessonItem } from '@/components/teaching/use-lessons';
import { LessonEditor } from './LessonEditor';
import { INSTITUTION_TIMEZONE } from '@/lib/constants/teaching';

// classDate é o instante de início da aula; exibido no fuso da instituição.
const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: INSTITUTION_TIMEZONE, dateStyle: 'short', timeStyle: 'short' });
const formatPeriod = (s: ScheduleItem) => `${formatDate(s.startDate)} a ${formatDate(s.endDate)}`;

const SELECT_CLASS =
  'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900';

export function LessonsPage() {
  const params = useSearchParams();
  const { plans, isLoading: plansLoading, error: plansError } = useTeacherPlans();
  const [planId, setPlanId] = React.useState<string | null>(null);
  const [scheduleId, setScheduleId] = React.useState<string | null>(params.get('scheduleId'));
  const [lessonId, setLessonId] = React.useState<string | null>(null);
  const { schedules } = useSchedules(planId);
  const { lessons, isLoading, error, reload } = useLessons(scheduleId);

  const lesson: LessonItem | null = lessons.find((l) => l.id === lessonId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <BookOpen className="h-6 w-6 text-brand-teal" /> Planos de aula
        </h1>
        <p className="text-sm text-slate-500">
          Edite o roteiro de cada encontro e anexe um vídeo do YouTube ou um arquivo de mídia. A agenda da turma é
          atualizada automaticamente.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="plan-select" className="text-sm font-medium">
            Plano de ensino
          </label>
          <select
            id="plan-select"
            value={planId ?? ''}
            onChange={(e) => {
              setPlanId(e.target.value || null);
              setScheduleId(null);
              setLessonId(null);
            }}
            className={SELECT_CLASS}
          >
            <option value="">{plansLoading ? 'Carregando planos...' : 'Selecione um plano'}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.subject.name} ({p.subject.code})
              </option>
            ))}
          </select>
          {plansError && (
            <p role="alert" className="text-sm text-red-600">
              {plansError}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="schedule-select" className="text-sm font-medium">
            Cronograma
          </label>
          <select
            id="schedule-select"
            value={scheduleId ?? ''}
            disabled={!planId && !scheduleId}
            onChange={(e) => {
              setScheduleId(e.target.value || null);
              setLessonId(null);
            }}
            className={SELECT_CLASS}
          >
            <option value="">Selecione um cronograma</option>
            {scheduleId && !schedules.some((s) => s.id === scheduleId) && <option value={scheduleId}>Cronograma selecionado</option>}
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {formatPeriod(s)} ({s.totalClasses} aulas)
              </option>
            ))}
          </select>
        </div>
      </div>

      {scheduleId && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Aulas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <p className="text-sm text-slate-500">Carregando aulas...</p>}
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              {!isLoading && !error && lessons.length === 0 && (
                <p className="text-sm text-slate-500">Nenhuma aula neste cronograma. Sincronize o calendário primeiro.</p>
              )}
              {lessons.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLessonId(l.id)}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${
                    l.id === lessonId ? 'border-brand-teal bg-brand-teal/5' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span className="font-semibold">
                    #{l.classNumber} · {l.topicTitle}
                  </span>
                  <span className="block text-xs text-slate-500">{formatDate(l.classDate)}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            {lesson ? (
              <LessonEditor key={lesson.id} lesson={lesson} onSaved={reload} />
            ) : (
              <p className="text-sm text-slate-500">Selecione uma aula para editar.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
