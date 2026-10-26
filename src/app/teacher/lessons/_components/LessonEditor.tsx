'use client';

import * as React from 'react';
import { Lock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AdvancedMultiCombobox } from '@/components/ui/advanced-multi-combobox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  INSTITUTION_TIMEZONE,
  LESSON_MEDIA_TYPE,
  LESSON_STATUS,
  LESSON_TITLE_MAX_LENGTH,
  NO_LESSON_CHAPTERS,
  type LessonMediaType,
} from '@/lib/constants/teaching';
import { toLocalDateTimeInput } from '@/lib/timezone';
import type { TimeScriptItem } from '@/domains/teaching/time-script';
import { publishBlockReason } from '@/domains/teaching/lesson-publish';
import { generateLesson, saveLesson, setLessonStatus, type LessonItem } from '@/components/teaching/use-lessons';
import { usePlanChapters } from '@/components/teaching/use-plan-chapters';
import { planChaptersToComboboxItems } from '@/components/teaching/chapter-combobox-item';
import { MediaTabs } from './MediaTabs';

const SAVE_ERROR = 'Não foi possível salvar a aula. Tente novamente.';
const GENERATE_ERROR = 'Não foi possível gerar a aula. Tente novamente.';
const STATUS_ERROR = 'Não foi possível alterar a situação da aula. Tente novamente.';
const UNSAVED_CHAPTERS = 'Salve os capítulos selecionados antes de gerar.';
const CONFIRM_REPLACE = 'Gerar com IA substitui o conteúdo atual do formulário. Continuar?';
const EMPTY_STEP: TimeScriptItem = { timeSeconds: 0, timeRange: '', activity: '', description: '', socraticQuestion: '' };

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
  const [steps, setSteps] = React.useState<TimeScriptItem[]>(lesson.timeScript);
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
  const { books } = usePlanChapters(lesson.courseSchedule.teachingPlanId);
  const chapterItems = React.useMemo(() => planChaptersToComboboxItems(books), [books]);
  const [citations, setCitations] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<'generate' | 'status' | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const updateStep = (index: number, patch: Partial<TimeScriptItem>) =>
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const selectionKey = chapterIds.slice().sort().join(',');
  const generateLock =
    savedChapterIds.length === 0 ? NO_LESSON_CHAPTERS : selectionKey !== savedKey ? UNSAVED_CHAPTERS : undefined;
  const publishLock = publishBlockReason(lesson);
  const published = lesson.status === LESSON_STATUS.PUBLISHED;

  async function generate() {
    const hasContent = [dailyObjective, methodology, fixationExercise].some((v) => v.trim() !== '') || steps.length > 0;
    if (hasContent && !window.confirm(CONFIRM_REPLACE)) return;
    setBusy('generate');
    setError(null);
    setNotice(null);
    try {
      const data = await generateLesson(lesson.id);
      setDailyObjective(data.dailyObjective);
      setMethodology(data.methodology);
      setResources(data.resourcesNeeded.join('\n'));
      setFixationExercise(data.fixationExercise);
      setSteps(data.timeScript);
      setCitations(data.citations);
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERATE_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus() {
    setBusy('status');
    setError(null);
    setNotice(null);
    try {
      await setLessonStatus(lesson.id, published ? LESSON_STATUS.DRAFT : LESSON_STATUS.PUBLISHED);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : STATUS_ERROR);
    } finally {
      setBusy(null);
    }
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
        resourcesNeeded: resources.split('\n').map((r) => r.trim()).filter(Boolean),
        timeScript: steps.map(({ socraticQuestion, ...step }) => (socraticQuestion ? { ...step, socraticQuestion } : step)),
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
              <Badge variant={published ? 'default' : 'secondary'}>{published ? 'Publicada' : 'Rascunho'}</Badge>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null || (!published && publishLock !== null)}
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
          <AdvancedMultiCombobox
            id="lesson-chapters"
            label="Capítulos desta aula"
            items={chapterItems}
            selectedIds={chapterIds}
            onSelectionChange={(ids) => setChapterIds(ids)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={generate} disabled={busy !== null || generateLock !== undefined} className="gap-2">
              {generateLock !== undefined ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {busy === 'generate' ? 'Gerando...' : 'Gerar aula com IA'}
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
          </div>
          <div className="space-y-1.5">
            <label htmlFor="methodology" className="text-xs font-semibold">
              Metodologia
            </label>
            <Textarea id="methodology" rows={2} value={methodology} onChange={(e) => setMethodology(e.target.value)} />
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Roteiro por etapas
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setSteps((c) => [...c, { ...EMPTY_STEP }])}>
              <Plus className="h-4 w-4" /> Etapa
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.length === 0 && <p className="text-sm text-slate-500">Nenhuma etapa. Adicione a primeira etapa do roteiro.</p>}
          {steps.map((step, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  type="number"
                  min={0}
                  aria-label={`Início da etapa ${i + 1} (segundos)`}
                  placeholder="Início (s)"
                  value={step.timeSeconds}
                  onChange={(e) => updateStep(i, { timeSeconds: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
                <Input
                  aria-label={`Faixa de tempo da etapa ${i + 1}`}
                  placeholder="Faixa (ex.: 00:00-15:00)"
                  value={step.timeRange}
                  onChange={(e) => updateStep(i, { timeRange: e.target.value })}
                />
                <Input
                  aria-label={`Atividade da etapa ${i + 1}`}
                  placeholder="Atividade"
                  value={step.activity}
                  onChange={(e) => updateStep(i, { activity: e.target.value })}
                />
              </div>
              <Textarea
                rows={2}
                aria-label={`Descrição da etapa ${i + 1}`}
                placeholder="Descrição"
                value={step.description}
                onChange={(e) => updateStep(i, { description: e.target.value })}
              />
              <div className="flex gap-2">
                <Input
                  aria-label={`Pergunta socrática da etapa ${i + 1}`}
                  placeholder="Pergunta socrática (opcional)"
                  value={step.socraticQuestion ?? ''}
                  onChange={(e) => updateStep(i, { socraticQuestion: e.target.value })}
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
