'use client';

import * as React from 'react';
import { Lock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LessonBadges } from './LessonBadges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  INSTITUTION_TIMEZONE,
  LESSON_MEDIA_TYPE,
  LESSON_STATUS,
  LESSON_TITLE_MAX_LENGTH,
  type LessonMediaType,
} from '@/lib/constants/teaching';
import { toLocalDateTimeInput } from '@/lib/timezone';
import type { TimeScriptItem } from '@/domains/teaching/time-script';
import { refineLesson, saveLesson, type LessonItem } from '@/components/teaching/use-lessons';
import { usePlanChapters } from '@/components/teaching/use-plan-chapters';
import { ChapterTreeSelect } from '@/components/teaching/ChapterTreeSelect';
import { MediaTabs } from './MediaTabs';
import { RefineField } from './RefineField';
import { useLessonGeneration } from './use-lesson-generation';
import { useLessonStatus } from './use-lesson-status';

const SAVE_ERROR = 'Não foi possível salvar a aula. Tente novamente.';
const EMPTY_STEP: TimeScriptItem = { timeSeconds: 0, timeRange: '', activity: '', description: '', socraticQuestion: '' };

// Id estável só de UI: o índice muda quando uma etapa anterior é removida.
type UiStep = TimeScriptItem & { uiKey: string };
let stepKeyCounter = 0;
const withKey = (step: TimeScriptItem): UiStep => ({ ...step, uiKey: `step-${stepKeyCounter++}` });

// Mesma normalização que o submit aplica antes de enviar.
const normalizeResources = (text: string) => text.split('\n').map((r) => r.trim()).filter(Boolean);

type Props = { lesson: LessonItem; onSaved: () => void };

export function LessonEditor({ lesson, onSaved }: Props) {
  const [topicTitle, setTopicTitle] = React.useState(lesson.topicTitle);
  // Data e hora de início no fuso da instituição; o servidor converte para UTC.
  const [classDate, setClassDate] = React.useState(() =>
    toLocalDateTimeInput(new Date(lesson.classDate), INSTITUTION_TIMEZONE)
  );
  const [dailyObjective, setDailyObjective] = React.useState(lesson.dailyObjective);
  const [methodology, setMethodology] = React.useState(lesson.methodology);
  const [fixationExercise, setFixationExercise] = React.useState(lesson.fixationExercise);
  const [resources, setResources] = React.useState(lesson.resourcesNeeded.join('\n'));
  const [steps, setSteps] = React.useState<UiStep[]>(() => lesson.timeScript.map(withKey));
  const [media, setMedia] = React.useState<{ type: LessonMediaType | null; url: string | null }>({
    type: lesson.mediaType,
    url: lesson.mediaUrl,
  });
  const savedChapterIds = React.useMemo(() => lesson.chapters.map((c) => c.chapterId), [lesson.chapters]);
  const savedKey = savedChapterIds.slice().sort().join(',');
  const [chapterIds, setChapterIds] = React.useState<string[]>(savedChapterIds);
  // Após o pai recarregar, a seleção volta a refletir os capítulos salvos.
  React.useEffect(() => {
    setChapterIds(savedKey ? savedKey.split(',') : []);
  }, [savedKey]);
  const {
    books,
    isLoading: chaptersLoading,
    error: chaptersError,
    reload: reloadChapters,
  } = usePlanChapters(lesson.courseSchedule.teachingPlanId);
  React.useEffect(() => {
    if (chaptersLoading || books.length === 0) return;
    const known = new Set(books.flatMap((b) => b.chapters.map((c) => c.id)));
    setChapterIds((ids) => (ids.every((id) => known.has(id)) ? ids : ids.filter((id) => known.has(id))));
  }, [books, chaptersLoading, savedKey]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const updateStep = (uiKey: string, patch: Partial<TimeScriptItem>) =>
    setSteps((current) => current.map((s) => (s.uiKey === uiKey ? { ...s, ...patch } : s)));

  const selectionKey = chapterIds.slice().sort().join(',');
  const refineDisabled = savedChapterIds.length === 0;
  const dirty = isDirty();
  const startAction = () => {
    setError(null);
    setNotice(null);
  };
  const { generate, generating, citations, lockReason: generateLock } = useLessonGeneration({
    lessonId: lesson.id,
    savedKey,
    selectionKey,
    hasContent: [dailyObjective, methodology, fixationExercise].some((v) => v.trim() !== '') || steps.length > 0,
    applyGenerated: (data) => {
      if (data.topicTitle) setTopicTitle(data.topicTitle);
      setDailyObjective(data.dailyObjective);
      setMethodology(data.methodology);
      setResources(data.resourcesNeeded.join('\n'));
      setFixationExercise(data.fixationExercise);
      setSteps(data.timeScript.map(withKey));
    },
    onStart: startAction,
    onError: setError,
  });
  const { changeStatus, changing, publishLock } = useLessonStatus({
    lesson,
    dirty,
    onSaved,
    onStart: startAction,
    onError: setError,
  });
  const busy = generating || changing;
  const published = lesson.status === LESSON_STATUS.PUBLISHED;

  // Compara o formulário com a aula salva; publicar só vale para o que está salvo.
  function isDirty(): boolean {
    // jsonb não preserva a ordem das chaves: compara campo a campo, não por JSON do objeto.
    const sig = (s: TimeScriptItem) =>
      JSON.stringify([s.timeSeconds, s.timeRange, s.activity, s.description, s.socraticQuestion ?? '']);
    return (
      topicTitle !== lesson.topicTitle ||
      classDate !== toLocalDateTimeInput(new Date(lesson.classDate), INSTITUTION_TIMEZONE) ||
      dailyObjective !== lesson.dailyObjective ||
      methodology !== lesson.methodology ||
      fixationExercise !== lesson.fixationExercise ||
      normalizeResources(resources).join('\n') !== lesson.resourcesNeeded.join('\n') ||
      steps.map(sig).join('|') !== lesson.timeScript.map(sig).join('|') ||
      (media.type ?? LESSON_MEDIA_TYPE.NONE) !== (lesson.mediaType ?? LESSON_MEDIA_TYPE.NONE) ||
      (media.url ?? null) !== (lesson.mediaUrl ?? null) ||
      selectionKey !== savedKey
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveLesson(lesson.id, {
        classDate,
        chapterIds,
        topicTitle,
        dailyObjective,
        methodology,
        fixationExercise,
        resourcesNeeded: normalizeResources(resources),
        timeScript: steps.map(({ uiKey: _uiKey, socraticQuestion, ...step }) => (socraticQuestion ? { ...step, socraticQuestion } : step)),
        mediaType: media.type ?? LESSON_MEDIA_TYPE.NONE,
        // Uploaded media is managed by the upload endpoint only.
        ...(media.type === LESSON_MEDIA_TYPE.S3_UPLOAD ? {} : { mediaUrl: media.url }),
      });
      setNotice(published ? 'Aula salva e agenda da turma atualizada.' : 'Aula salva.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : SAVE_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              Aula #{lesson.classNumber}
              <LessonBadges lesson={lesson} />
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || (!published && publishLock !== null)}
              onClick={changeStatus}
            >
              {published ? 'Despublicar' : 'Publicar'}
            </Button>
          </CardTitle>
          {!published && publishLock !== null && (
            <p className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>{publishLock}</span>
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {chaptersError ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-red-600">
                Não foi possível carregar os capítulos do plano.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={reloadChapters}>
                Tentar de novo
              </Button>
            </div>
          ) : chaptersLoading && books.length === 0 ? (
            <p className="text-sm text-slate-500">Carregando capítulos...</p>
          ) : (
            <ChapterTreeSelect
              id="lesson-chapters"
              label="Capítulos desta aula"
              books={books}
              selectedIds={chapterIds}
              onSelectionChange={setChapterIds}
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={generate} disabled={busy || generateLock !== undefined} className="gap-2">
              {generateLock !== undefined ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Gerando...' : 'Gerar aula com IA'}
            </Button>
            {generateLock !== undefined && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>{generateLock}</span>
              </span>
            )}
          </div>
          {citations.length > 0 && <p className="text-xs text-slate-500">Fontes: {citations.join('; ')}</p>}
          <div className="space-y-1.5">
            <label htmlFor="topic-title" className="text-xs font-semibold">
              Título do tópico
            </label>
            <Input
              id="topic-title"
              value={topicTitle}
              maxLength={LESSON_TITLE_MAX_LENGTH}
              onChange={(e) => setTopicTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="class-date" className="text-xs font-semibold">
              Data e horário de início ({INSTITUTION_TIMEZONE})
            </label>
            <Input
              id="class-date"
              type="datetime-local"
              required
              value={classDate}
              onChange={(e) => setClassDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="daily-objective" className="text-xs font-semibold">
              Objetivo diário
            </label>
            <Textarea id="daily-objective" rows={3} value={dailyObjective} onChange={(e) => setDailyObjective(e.target.value)} />
            <RefineField
              label="objetivo diário"
              value={dailyObjective}
              disabled={refineDisabled}
              onApply={setDailyObjective}
              request={(instruction) => refineLesson(lesson.id, { field: 'dailyObjective', instruction, current: dailyObjective })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="methodology" className="text-xs font-semibold">
              Metodologia
            </label>
            <Textarea id="methodology" rows={2} value={methodology} onChange={(e) => setMethodology(e.target.value)} />
            <RefineField
              label="metodologia"
              value={methodology}
              disabled={refineDisabled}
              onApply={setMethodology}
              request={(instruction) => refineLesson(lesson.id, { field: 'methodology', instruction, current: methodology })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="resources" className="text-xs font-semibold">
              Recursos necessários (um por linha)
            </label>
            <Textarea id="resources" rows={2} value={resources} onChange={(e) => setResources(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fixation" className="text-xs font-semibold">
              Exercício de fixação
            </label>
            <Textarea id="fixation" rows={2} value={fixationExercise} onChange={(e) => setFixationExercise(e.target.value)} />
            <RefineField
              label="exercício de fixação"
              value={fixationExercise}
              disabled={refineDisabled}
              onApply={setFixationExercise}
              request={(instruction) => refineLesson(lesson.id, { field: 'fixationExercise', instruction, current: fixationExercise })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Roteiro por etapas
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setSteps((c) => [...c, withKey(EMPTY_STEP)])}>
              <Plus className="h-4 w-4" /> Etapa
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.length === 0 && <p className="text-sm text-slate-500">Nenhuma etapa. Adicione a primeira etapa do roteiro.</p>}
          {steps.map((step, i) => (
            <div key={step.uiKey} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  type="number"
                  min={0}
                  aria-label={`Início da etapa ${i + 1} (segundos)`}
                  placeholder="Início (s)"
                  value={step.timeSeconds}
                  onChange={(e) => updateStep(step.uiKey, { timeSeconds: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
                <Input
                  aria-label={`Faixa de tempo da etapa ${i + 1}`}
                  placeholder="Faixa (ex.: 00:00-15:00)"
                  value={step.timeRange}
                  onChange={(e) => updateStep(step.uiKey, { timeRange: e.target.value })}
                />
                <Input
                  aria-label={`Atividade da etapa ${i + 1}`}
                  placeholder="Atividade"
                  value={step.activity}
                  onChange={(e) => updateStep(step.uiKey, { activity: e.target.value })}
                />
              </div>
              <Textarea
                rows={2}
                aria-label={`Descrição da etapa ${i + 1}`}
                placeholder="Descrição"
                value={step.description}
                onChange={(e) => updateStep(step.uiKey, { description: e.target.value })}
              />
              <RefineField
                label={`etapa ${i + 1}`}
                value={step.description}
                disabled={refineDisabled}
                onApply={(text) => updateStep(step.uiKey, { description: text })}
                request={(instruction) =>
                  refineLesson(lesson.id, { field: 'timeScript', stepIndex: i, instruction, current: step.description })
                }
              />
              <div className="flex gap-2">
                <Input
                  aria-label={`Pergunta socrática da etapa ${i + 1}`}
                  placeholder="Pergunta socrática (opcional)"
                  value={step.socraticQuestion ?? ''}
                  onChange={(e) => updateStep(step.uiKey, { socraticQuestion: e.target.value })}
                />
                <Button type="button" variant="ghost" size="sm" aria-label={`Remover etapa ${i + 1}`} onClick={() => setSteps((c) => c.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mídia da aula</CardTitle>
        </CardHeader>
        <CardContent>
          <MediaTabs
            lessonId={lesson.id}
            mediaType={media.type}
            mediaUrl={media.url}
            onYoutubeChange={(url) => setMedia({ type: url ? LESSON_MEDIA_TYPE.YOUTUBE : LESSON_MEDIA_TYPE.NONE, url: url || null })}
            onUploaded={(updated) => {
              setMedia({ type: updated.mediaType, url: updated.mediaUrl });
              onSaved();
            }}
          />
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-600">
          {notice}
        </p>
      )}
      <Button type="submit" disabled={saving} className="bg-brand-teal text-white hover:bg-brand-teal-dark">
        {saving ? 'Salvando...' : 'Salvar aula'}
      </Button>
    </form>
  );
}
