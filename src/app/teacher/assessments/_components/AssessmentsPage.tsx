'use client';

import * as React from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ASSESSMENT_STATUS, INSTITUTION_TIMEZONE } from '@/lib/constants/teaching';
import { useAssessments, useTeacherPlans, type AssessmentItem } from '@/components/assessments/use-assessments';
import { AssessmentEditor } from './AssessmentEditor';
import { PublishDialog } from './PublishDialog';
import { SubmissionsTable } from './SubmissionsTable';

type View =
  | { kind: 'list' }
  | { kind: 'editor'; assessment: AssessmentItem | null }
  | { kind: 'submissions'; assessment: AssessmentItem };

const STATUS_LABEL: Record<string, string> = {
  [ASSESSMENT_STATUS.DRAFT]: 'Rascunho',
  [ASSESSMENT_STATUS.PUBLISHED]: 'Publicada',
};

const formatWindow = (start: string, end: string) =>
  `${new Date(start).toLocaleString('pt-BR', { timeZone: INSTITUTION_TIMEZONE })} até ${new Date(end).toLocaleString('pt-BR', { timeZone: INSTITUTION_TIMEZONE })}`;

export function AssessmentsPage() {
  const { plans, isLoading: plansLoading, error: plansError } = useTeacherPlans();
  const [planId, setPlanId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<View>({ kind: 'list' });
  const [publishing, setPublishing] = React.useState<AssessmentItem | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const { assessments, isLoading, error, reload } = useAssessments(planId);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const classOptions = plan?.subject.class ? [plan.subject.class] : [];
  const backToList = () => setView({ kind: 'list' });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold font-heading">
          <ClipboardList className="h-6 w-6 text-brand-teal" /> Avaliações
        </h1>
        <p className="text-sm text-slate-500">Crie, publique e acompanhe as provas dos seus planos de ensino.</p>
      </header>

      <div className="space-y-1">
        <label htmlFor="plan-select" className="text-sm font-medium">
          Plano de ensino
        </label>
        <select
          id="plan-select"
          value={planId ?? ''}
          onChange={(e) => {
            setPlanId(e.target.value || null);
            backToList();
          }}
          className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">{plansLoading ? 'Carregando planos...' : 'Selecione um plano'}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.subject.discipline.name} ({p.subject.discipline.code})
            </option>
          ))}
        </select>
        {plansError && <p role="alert" className="text-sm text-red-600">{plansError}</p>}
      </div>

      {plan && view.kind === 'editor' && (
        <AssessmentEditor
          plan={plan}
          initial={view.assessment}
          onSaved={() => {
            reload();
            backToList();
          }}
          onCancel={backToList}
        />
      )}

      {view.kind === 'submissions' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Submissões: {view.assessment.title}</CardTitle>
            <Button variant="outline" size="sm" onClick={backToList}>
              Voltar
            </Button>
          </CardHeader>
          <CardContent>
            <SubmissionsTable assessmentId={view.assessment.id} />
          </CardContent>
        </Card>
      )}

      {plan && view.kind === 'list' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Provas do plano</h2>
            <Button className="gap-2" onClick={() => setView({ kind: 'editor', assessment: null })}>
              <Plus className="h-4 w-4" /> Nova avaliação
            </Button>
          </div>
          {notice && <p role="status" className="text-sm text-amber-600">{notice}</p>}
          {isLoading && <p className="text-sm text-slate-500">Carregando avaliações...</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {!isLoading && !error && assessments.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma avaliação criada para este plano.</p>
          )}
          {assessments.map((a) => {
            const published = a.status === ASSESSMENT_STATUS.PUBLISHED;
            return (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <p className="font-semibold">{a.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge variant={published ? 'default' : 'outline'}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                      <span>{a.questions.length} questões</span>
                      <span>{a.durationMinutes} min</span>
                    </div>
                    {a.agendas.map((ag) => (
                      <p key={ag.id} className="text-xs text-slate-500">
                        Janela: {formatWindow(ag.startTime, ag.endTime)}
                      </p>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {!published && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setView({ kind: 'editor', assessment: a })}>
                          Editar
                        </Button>
                        <Button size="sm" onClick={() => setPublishing(a)}>
                          Publicar
                        </Button>
                      </>
                    )}
                    {published && (
                      <Button variant="outline" size="sm" onClick={() => setView({ kind: 'submissions', assessment: a })}>
                        Submissões
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {publishing && (
        <PublishDialog
          assessmentId={publishing.id}
          classOptions={classOptions}
          onClose={() => setPublishing(null)}
          onPublished={(message) => {
            setPublishing(null);
            setNotice(message ?? null);
            reload();
          }}
        />
      )}
    </div>
  );
}
