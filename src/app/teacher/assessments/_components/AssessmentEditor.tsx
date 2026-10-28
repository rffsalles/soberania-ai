'use client';

import * as React from 'react';
import { AlertTriangle, Lock, Plus, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OPTION_KEYS } from '@/lib/constants/assessments';
import type { Question, Rubric } from '@/domains/assessments/question-schema';
import { ASSESSMENT_TYPE, type AssessmentType } from '@/lib/constants/teaching';
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from '@/lib/validators/assessment.validator';
import { ChapterTreeSelect } from '@/components/teaching/ChapterTreeSelect';
import { usePlanChapters } from '@/components/teaching/use-plan-chapters';
import { formatChapterLabel } from '@/domains/rag/chapter-label';
import { validateAssessmentDraft } from '@/components/assessments/assessment-draft';
import {
  generateAssessment,
  saveAssessment,
  type AssessmentDraft,
  type AssessmentItem,
  type PlanOption,
} from '@/components/assessments/use-assessments';

const ASSESSMENT_TYPE_LABEL = { [ASSESSMENT_TYPE.EXAM]: 'Prova' } satisfies Record<AssessmentType, string>;
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_MAX_SCORE = 10;
const DEFAULT_QUESTION_COUNT = 5;
const MAX_QUESTION_COUNT = 20;
const CHAPTERS_ERROR = 'Não foi possível carregar os capítulos do plano.';

type Props = {
  plan: PlanOption;
  initial: AssessmentItem | null;
  onSaved: () => void;
  onCancel: () => void;
};

const blankQuestion = (n: number): Question => ({
  id: `q${n}`,
  enunciation: '',
  options: OPTION_KEYS.map((key) => ({ key, text: '' })),
  correctKey: OPTION_KEYS[0],
  rationale: '',
  topic: '',
});

export function AssessmentEditor({ plan, initial, onSaved, onCancel }: Props) {
  const [draft, setDraft] = React.useState<AssessmentDraft>({
    title: initial?.title ?? '',
    type: initial?.type ?? ASSESSMENT_TYPE.EXAM,
    questions: initial?.questions ?? [],
    rubrics: Array.isArray(initial?.rubrics) ? initial.rubrics : [],
    maxScore: initial?.maxScore ?? DEFAULT_MAX_SCORE,
    durationMinutes: initial?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
    chapterIds: initial?.chapterIds ?? [],
  });
  const [chapterIds, setChapterIds] = React.useState<string[]>(initial?.chapterIds ?? []);
  const [count, setCount] = React.useState(DEFAULT_QUESTION_COUNT);
  const [offline, setOffline] = React.useState(false);
  const [busy, setBusy] = React.useState<'generate' | 'save' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { books, isLoading: chaptersLoading, error: chaptersError, reload: reloadChapters } = usePlanChapters(plan.id);
  React.useEffect(() => {
    if (chaptersLoading || books.length === 0) return;
    const known = new Set(books.flatMap((b) => b.chapters.map((c) => c.id)));
    setChapterIds((ids) => (ids.every((id) => known.has(id)) ? ids : ids.filter((id) => known.has(id))));
  }, [books, chaptersLoading]);
  const chapterLabels = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const book of books) for (const c of book.chapters) map.set(c.id, formatChapterLabel({ ...c, book }));
    return map;
  }, [books]);
  const problems = validateAssessmentDraft(draft);
  const lockReason = React.useMemo(() => {
    if (chaptersError) return CHAPTERS_ERROR;
    if (chaptersLoading) return 'Carregando capítulos...';
    if (chapterIds.length === 0) return 'Selecione ao menos um capítulo.';
    if (!Number.isInteger(count) || count < 1 || count > MAX_QUESTION_COUNT) {
      return `Informe entre 1 e ${MAX_QUESTION_COUNT} questões.`;
    }
    return undefined;
  }, [chaptersError, chaptersLoading, chapterIds.length, count]);

  const run = async (kind: 'generate' | 'save', action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const generate = () =>
    run('generate', async () => {
      const out = await generateAssessment({ teachingPlanId: plan.id, chapterIds, questionCount: count, type: draft.type });
      setDraft((d) => ({ ...d, questions: out.questions, rubrics: out.rubrics }));
      setOffline(out.fallback);
    });

  const save = () =>
    run('save', async () => {
      await saveAssessment(plan.id, initial?.id ?? null, { ...draft, chapterIds });
      onSaved();
    });

  const patchQuestion = (index: number, patch: Partial<Question>) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) }));

  const patchOption = (index: number, key: string, text: string) =>
    patchQuestion(index, {
      options: draft.questions[index].options.map((o) => (o.key === key ? { ...o, text } : o)),
    });

  const patchRubric = (index: number, patch: Partial<Rubric>) =>
    setDraft((d) => ({ ...d, rubrics: d.rubrics.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{initial ? 'Editar avaliação' : 'Nova avaliação'}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1 md:col-span-3">
            <Label htmlFor="as-title">Título</Label>
            <Input id="as-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="as-type">Tipo</Label>
            <select
              id="as-type"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {Object.values(ASSESSMENT_TYPE).map((t) => (
                <option key={t} value={t}>
                  {ASSESSMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="as-duration">Duração (minutos)</Label>
            <Input
              id="as-duration"
              type="number"
              min={MIN_DURATION_MINUTES}
              max={MAX_DURATION_MINUTES}
              value={draft.durationMinutes}
              onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="as-max">Nota máxima</Label>
            <Input
              id="as-max"
              type="number"
              min={1}
              value={draft.maxScore}
              onChange={(e) => setDraft({ ...draft, maxScore: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Gerar com IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {chaptersError ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-red-600">
                {CHAPTERS_ERROR}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={reloadChapters}>
                Tentar de novo
              </Button>
            </div>
          ) : chaptersLoading && books.length === 0 ? (
            <p className="text-sm text-slate-500">Carregando capítulos...</p>
          ) : (
            <ChapterTreeSelect
              id="assessment-chapters"
              label="Capítulos desta avaliação"
              books={books}
              selectedIds={chapterIds}
              onSelectionChange={setChapterIds}
            />
          )}
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="as-count">Nº de questões</Label>
              <Input
                id="as-count"
                type="number"
                min={1}
                max={MAX_QUESTION_COUNT}
                className="w-28"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
            <Button onClick={generate} disabled={busy !== null || lockReason !== undefined} className="gap-2">
              {lockReason !== undefined && busy === null ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {busy === 'generate' ? 'Gerando...' : 'Gerar com IA'}
            </Button>
          </div>
          {lockReason !== undefined && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium max-w-xs">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>{lockReason}</span>
            </span>
          )}
          {offline && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Questões geradas sem IA (modo offline). Revise antes de publicar.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Questões ({draft.questions.length})</CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setDraft((d) => ({ ...d, questions: [...d.questions, blankQuestion(d.questions.length + 1)] }))}
          >
            <Plus className="h-3.5 w-3.5" /> Questão
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.questions.map((q, i) => (
            <div key={q.id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Questão {i + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover questão ${i + 1}`}
                  onClick={() => setDraft((d) => ({ ...d, questions: d.questions.filter((_, n) => n !== i) }))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {q.chapterId && chapterLabels.get(q.chapterId) && (
                <p className="text-xs text-slate-500">{chapterLabels.get(q.chapterId)}</p>
              )}
              <Textarea
                aria-label={`Enunciado da questão ${i + 1}`}
                value={q.enunciation}
                onChange={(e) => patchQuestion(i, { enunciation: e.target.value })}
              />
              {q.options.map((o) => (
                <div key={o.key} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    aria-label={`Alternativa ${o.key} correta`}
                    checked={q.correctKey === o.key}
                    onChange={() => patchQuestion(i, { correctKey: o.key })}
                  />
                  <span className="w-5 text-sm font-semibold">{o.key}</span>
                  <Input
                    aria-label={`Alternativa ${o.key} da questão ${i + 1}`}
                    value={o.text}
                    onChange={(e) => patchOption(i, o.key, e.target.value)}
                  />
                </div>
              ))}
              <Input
                aria-label={`Tópico da questão ${i + 1}`}
                placeholder="Tópico"
                value={q.topic}
                onChange={(e) => patchQuestion(i, { topic: e.target.value })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Rubricas ({draft.rubrics.length})</CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() =>
              setDraft((d) => ({ ...d, rubrics: [...d.rubrics, { criterion: '', description: '', weight: 1 }] }))
            }
          >
            <Plus className="h-3.5 w-3.5" /> Rubrica
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.rubrics.map((r, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[1fr_2fr_6rem_auto]">
              <Input
                aria-label={`Critério ${i + 1}`}
                placeholder="Critério"
                value={r.criterion}
                onChange={(e) => patchRubric(i, { criterion: e.target.value })}
              />
              <Input
                aria-label={`Descrição do critério ${i + 1}`}
                placeholder="Descrição"
                value={r.description}
                onChange={(e) => patchRubric(i, { description: e.target.value })}
              />
              <Input
                aria-label={`Peso do critério ${i + 1}`}
                type="number"
                value={r.weight}
                onChange={(e) => patchRubric(i, { weight: Number(e.target.value) })}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remover rubrica ${i + 1}`}
                onClick={() => setDraft((d) => ({ ...d, rubrics: d.rubrics.filter((_, n) => n !== i) }))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {(error ?? problems[0]) && (
        <p role="alert" className="text-sm text-red-600">
          {error ?? problems[0]}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          onClick={save}
          disabled={busy !== null || draft.title.trim().length < 3 || problems.length > 0}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {busy === 'save' ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
