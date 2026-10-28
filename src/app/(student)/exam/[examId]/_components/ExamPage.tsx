'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SocraticChatPanel } from '@/components/classroom/socratic-chat-panel';
import {
  FileCheck2,
  Clock,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_ROUTES } from '@/lib/constants/routes';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import type { PublicQuestion } from '@/domains/assessments/services/exam-service';

interface ExamPageProps {
  examId: string;
}

interface ExamPayload {
  agenda: AgendaDTO;
  questions: PublicQuestion[];
  serverNow: string;
  durationMinutes: number;
  maxScore: number;
  alreadySubmitted: boolean;
  submission?: { score: number; maxScore: number };
}

interface ExamResult {
  score: number;
  maxScore: number;
  correct?: number;
  total?: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; exam: ExamPayload };

const HTTP_NOT_FOUND = 404;
const MS_PER_SECOND = 1000;
const LOAD_ERROR = 'Não foi possível carregar a prova. Tente novamente.';
const SUBMIT_ERROR = 'Não foi possível enviar a prova. Tente novamente.';
const NOT_FOUND_MESSAGE = 'Prova não encontrada.';

const formatTimer = (totalSecs: number) => {
  const m = Math.floor(totalSecs / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSecs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

function StatusCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-12">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-heading">{title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 dark:text-slate-300">{message}</CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function ExamPage({ examId }: ExamPageProps) {
  const [load, setLoad] = React.useState<LoadState>({ status: 'loading' });

  React.useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_ROUTES.EXAMS}/${examId}`, { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (res.ok && body?.success) {
          setLoad({ status: 'ready', exam: body as ExamPayload });
        } else {
          setLoad({
            status: 'error',
            message:
              res.status === HTTP_NOT_FOUND
                ? NOT_FOUND_MESSAGE
                : typeof body?.error === 'string'
                  ? body.error
                  : LOAD_ERROR,
          });
        }
      } catch {
        if (!controller.signal.aborted) setLoad({ status: 'error', message: LOAD_ERROR });
      }
    })();
    return () => controller.abort();
  }, [examId]);

  if (load.status === 'loading') return <StatusCard title="Prova" message="Carregando prova..." />;
  if (load.status === 'error') return <StatusCard title="Prova indisponível" message={load.message} />;
  return <ExamRunner examId={examId} exam={load.exam} />;
}

function ExamRunner({ examId, exam }: { examId: string; exam: ExamPayload }) {
  const [selected, setSelected] = React.useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const endMs = React.useMemo(() => new Date(exam.agenda.endTime).getTime(), [exam.agenda.endTime]);
  const clockOffsetRef = React.useRef(new Date(exam.serverNow).getTime() - Date.now());
  const remaining = React.useCallback(
    () => Math.max(0, Math.ceil((endMs - (Date.now() + clockOffsetRef.current)) / MS_PER_SECOND)),
    [endMs]
  );
  const [secondsRemaining, setSecondsRemaining] = React.useState(remaining);
  const [tabBlurCount, setTabBlurCount] = React.useState(0);
  const [guardrailBlocks, setGuardrailBlocks] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ExamResult | null>(
    exam.alreadySubmitted && exam.submission ? exam.submission : null
  );
  const spentRef = React.useRef<Record<string, number>>({});
  const enteredAtRef = React.useRef(Date.now());
  const questions = exam.questions;
  const currentQ = questions[currentIndex];

  const flushTime = React.useCallback(() => {
    const q = questions[currentIndex];
    const now = Date.now();
    if (q) {
      spentRef.current[q.id] =
        (spentRef.current[q.id] ?? 0) + Math.round((now - enteredAtRef.current) / MS_PER_SECOND);
    }
    enteredAtRef.current = now;
  }, [questions, currentIndex]);

  const goTo = (index: number) => {
    flushTime();
    setCurrentIndex(index);
  };

  React.useEffect(() => {
    const handleBlur = () => setTabBlurCount((prev) => prev + 1);
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  const submit = React.useCallback(async () => {
    if (isSubmitting || result) return;
    flushTime();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_ROUTES.EXAMS}/${examId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: Object.entries(selected).map(([questionId, chosenKey]) => ({
            questionId,
            chosenKey,
            timeSpentSeconds: spentRef.current[questionId] ?? 0,
          })),
          integrityLog: { blurEvents: tabBlurCount, guardrailBlocks },
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.success) {
        setResult(body as ExamResult);
      } else {
        setSubmitError(typeof body?.error === 'string' ? body.error : SUBMIT_ERROR);
      }
    } catch {
      setSubmitError(SUBMIT_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, result, flushTime, examId, selected, tabBlurCount, guardrailBlocks]);

  const submitRef = React.useRef(submit);
  submitRef.current = submit;

  // Timer regressivo calculado a partir do fim da agenda; envia automaticamente ao zerar
  React.useEffect(() => {
    if (result) return;
    const timer = setInterval(() => {
      const left = remaining();
      setSecondsRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        void submitRef.current();
      }
    }, MS_PER_SECOND);
    return () => clearInterval(timer);
  }, [result, remaining]);

  if (result) {
    return (
      <StatusCard
        title={exam.alreadySubmitted ? 'Prova já enviada' : 'Prova enviada'}
        message={`Sua nota: ${result.score.toLocaleString('pt-BR')} de ${result.maxScore.toLocaleString('pt-BR')}.${
          result.total !== undefined ? ` Acertos: ${result.correct} de ${result.total}.` : ''
        }`}
      />
    );
  }

  if (!currentQ) return <StatusCard title="Prova indisponível" message="Esta prova não possui questões." />;

  const handleSelectOption = (key: string) => setSelected((prev) => ({ ...prev, [currentQ.id]: key }));

  return (
    <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">

      <main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Exam Status Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="amber" className="gap-1 font-semibold">
                <FileCheck2 className="h-3.5 w-3.5" />
                AVALIAÇÃO DIAGNÓSTICA SUPERVISIONADA
              </Badge>
              <span className="text-xs text-slate-500 font-mono">ID: {examId}</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">|</span>
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                👨‍🏫 Prof. Responsável: <strong>{exam.agenda.teacherName}</strong>
              </span>
              <span className="text-xs text-slate-300 dark:text-slate-700">|</span>
              <span className="text-xs text-brand-teal font-medium">
                🛡️ Proctoring IA: <strong>Tutora Lucy</strong>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white">
              {exam.agenda.title}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Regressive Clock */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-mono text-base font-bold">
              <Clock className="h-4 w-4 text-amber-600 animate-pulse" />
              <span>{formatTimer(secondsRemaining)}</span>
            </div>

            {/* Anti-Cheat Integrity Warning */}
            {tabBlurCount > 0 && (
              <Badge variant="destructive" className="gap-1 text-xs px-2.5 py-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {tabBlurCount} saída(s) de tela registrada(s)
              </Badge>
            )}
          </div>
        </div>

        {/* 2-Column Responsive Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Questions & Alternatives (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-heading">
                  Questão {currentIndex + 1} de {questions.length}
                </CardTitle>
                <div className="flex gap-1">
                  {questions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => goTo(idx)}
                      className={cn(
                        'h-7 w-7 rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer',
                        currentIndex === idx
                          ? 'bg-brand-teal text-white'
                          : selected[q.id]
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-6">
                <p className="text-sm sm:text-base font-medium text-slate-800 dark:text-slate-100 leading-relaxed">
                  {currentQ.enunciation}
                </p>

                {/* Options List */}
                <div className="space-y-2.5">
                  {currentQ.options.map((opt) => {
                    const isSelected = selected[currentQ.id] === opt.key;
                    return (
                      <div
                        key={opt.key}
                        onClick={() => handleSelectOption(opt.key)}
                        className={cn(
                          'p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3 text-sm leading-relaxed',
                          isSelected
                            ? 'bg-brand-teal/10 border-brand-teal text-slate-900 dark:text-white font-medium shadow-xs'
                            : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100/80'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-bold text-xs',
                            isSelected
                              ? 'bg-brand-teal text-white'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                          )}
                        >
                          {opt.key}
                        </span>
                        <span>{opt.text}</span>
                      </div>
                    );
                  })}
                </div>

                {submitError && (
                  <p role="alert" className="text-sm text-red-600">
                    {submitError}
                  </p>
                )}

                {(submitError || secondsRemaining === 0) && (
                  <Button
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => void submit()}
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                    <span>Tentar enviar novamente</span>
                  </Button>
                )}

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentIndex === 0}
                    onClick={() => goTo(currentIndex - 1)}
                    className="gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Anterior</span>
                  </Button>

                  {currentIndex < questions.length - 1 ? (
                    <Button
                      size="sm"
                      onClick={() => goTo(currentIndex + 1)}
                      className="gap-1 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
                    >
                      <span>Próxima</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => void submit()}
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{isSubmitting ? 'Enviando...' : 'Submeter Avaliação'}</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Socratic Proctor with Anti-Cheat Guardrails (5 cols) */}
          <div className="lg:col-span-5 h-[580px]">
            <SocraticChatPanel
              agendaType="EXAM"
              agendaId={examId}
              onGuardrailBlock={() => setGuardrailBlocks((n) => n + 1)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
