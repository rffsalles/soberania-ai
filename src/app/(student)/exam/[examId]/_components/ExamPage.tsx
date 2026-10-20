'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
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
import { EXAM_QUESTIONS } from '@/lib/mocks-pending';

interface ExamPageProps {
  examId: string;
}

interface Question {
  id: number;
  enunciation: string;
  options: { key: string; text: string }[];
  selectedOption?: string;
}


export default function ExamPage({ examId }: ExamPageProps) {
  const [questions, setQuestions] = React.useState<Question[]>(EXAM_QUESTIONS);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [secondsRemaining, setSecondsRemaining] = React.useState(2850); // 47:30 min
  const [tabBlurCount, setTabBlurCount] = React.useState(0);
  const [isSubmitted, setIsSubmitted] = React.useState(false);

  // Monitoramento de integridade e perda de foco de aba
  React.useEffect(() => {
    const handleBlur = () => {
      setTabBlurCount((prev) => prev + 1);
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  // Timer regressivo
  React.useEffect(() => {
    if (isSubmitted) return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isSubmitted]);

  const formatTimer = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60)
      .toString()
      .padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentQ = questions[currentIndex];

  const handleSelectOption = (key: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === currentIndex ? { ...q, selectedOption: key } : q))
    );
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
                👨‍🏫 Profª. Responsável: <strong>Profª. Dra. Helena Salles</strong>
              </span>
              <span className="text-xs text-slate-300 dark:text-slate-700">|</span>
              <span className="text-xs text-brand-teal font-medium">
                🛡️ Proctoring IA: <strong>Tutora Lucy</strong>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white">
              Avaliação 01: Álgebra Relacional, SQL & Normalização
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
                  Questão {currentQ.id} de {questions.length}
                </CardTitle>
                <div className="flex gap-1">
                  {questions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={cn(
                        'h-7 w-7 rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer',
                        currentIndex === idx
                          ? 'bg-brand-teal text-white'
                          : q.selectedOption
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {q.id}
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
                    const isSelected = currentQ.selectedOption === opt.key;
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

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((prev) => prev - 1)}
                    className="gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Anterior</span>
                  </Button>

                  {currentIndex < questions.length - 1 ? (
                    <Button
                      size="sm"
                      onClick={() => setCurrentIndex((prev) => prev + 1)}
                      className="gap-1 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
                    >
                      <span>Próxima</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setIsSubmitted(true)}
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Submeter Avaliação</span>
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
            />
          </div>
        </div>
      </main>
    </div>
  );
}
