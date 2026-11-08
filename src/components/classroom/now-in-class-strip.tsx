'use client';

import * as React from 'react';
import { LiveStatusIndicator } from '@/components/classroom/live-status-indicator';
import { Button } from '@/components/ui/button';
import {
  stepLabel,
  type AnswerOutcome,
  type StudentQuestion,
  type StudentView,
} from '@/domains/classroom/class-state';
import type { ClassEventsStatus } from '@/components/classroom/use-class-events';

type AnswerInput = { optionKey?: string; text?: string };

interface NowInClassStripProps {
  view: StudentView;
  status: ClassEventsStatus;
  onAnswer: (seq: number, input: AnswerInput) => void;
  answerPending: boolean;
  answerError: string | null;
  onContinueInChat: (text: string) => void;
}

export function continueInChatText(q: StudentQuestion, a: AnswerOutcome): string {
  if (q.kind === 'OPEN') {
    return `Sobre a pergunta "${q.text}": pode me ajudar a pensar na resposta?`;
  }
  const rationale = 'rationale' in a ? a.rationale : null;
  return rationale
    ? `Sobre a pergunta "${q.enunciation}": a justificativa foi "${rationale}". Pode me explicar melhor?`
    : `Sobre a pergunta "${q.enunciation}": pode me ajudar a revisar?`;
}

function feedbackLines(q: StudentQuestion, a: AnswerOutcome): string[] {
  if ('alreadyAnswered' in a) return ['Você já respondeu esta pergunta.'];
  if (q.kind === 'OPEN') return ['Resposta registrada.'];
  const lines = [a.wasCorrect ? 'Você acertou.' : `Resposta certa: ${a.correctKey}.`];
  if (a.rationale) lines.push(a.rationale);
  return lines;
}

function QuestionBlock({
  question,
  answer,
  onAnswer,
  answerPending,
  answerError,
  onContinueInChat,
}: {
  question: StudentQuestion;
  answer: AnswerOutcome | null;
} & Pick<NowInClassStripProps, 'onAnswer' | 'answerPending' | 'answerError' | 'onContinueInChat'>) {
  const [optionKey, setOptionKey] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  const canSubmit = !answerPending && (question.kind === 'MULTIPLE_CHOICE' ? optionKey !== null : text.trim() !== '');

  const submit = () => {
    if (!canSubmit) return;
    onAnswer(question.seq, question.kind === 'MULTIPLE_CHOICE' ? { optionKey: optionKey! } : { text: text.trim() });
  };

  return (
    <div className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pergunta rápida (opcional)</p>
      <p className="text-sm font-medium text-slate-900 dark:text-white">
        {question.kind === 'MULTIPLE_CHOICE' ? question.enunciation : question.text}
      </p>
      {answer ? (
        <div className="space-y-2">
          {feedbackLines(question, answer).map((line) => (
            <p key={line} className="text-sm text-slate-700 dark:text-slate-200">
              {line}
            </p>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => onContinueInChat(continueInChatText(question, answer))}>
            Continuar no chat
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {question.kind === 'MULTIPLE_CHOICE' ? (
            <div role="radiogroup" aria-label="Alternativas" className="space-y-1">
              {question.options.map((o) => (
                <label key={o.key} className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
                  <input
                    type="radio"
                    name={`tutor-q-${question.seq}`}
                    value={o.key}
                    checked={optionKey === o.key}
                    onChange={() => setOptionKey(o.key)}
                    disabled={answerPending}
                    className="mt-1"
                  />
                  <span>{`${o.key}) ${o.text}`}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              aria-label="Sua resposta"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={answerPending}
              rows={3}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm"
            />
          )}
          {answerError && (
            <p role="alert" className="text-xs text-rose-600">
              {answerError}
            </p>
          )}
          <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
            {answerPending ? 'Enviando...' : 'Responder'}
          </Button>
        </div>
      )}
    </div>
  );
}

export function NowInClassStrip({
  view,
  status,
  onAnswer,
  answerPending,
  answerError,
  onContinueInChat,
}: NowInClassStripProps) {
  if (view.stepIndex === null) return null;
  const { card, question, answer } = view;
  return (
    <section
      data-testid="now-in-class-strip"
      aria-label="Agora na aula"
      className="space-y-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-brand-teal/40 shadow-xs"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">Agora na aula</p>
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            {view.activity ?? stepLabel(view.stepIndex)}
          </p>
        </div>
        <LiveStatusIndicator status={status} />
      </div>

      {card && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Da tutora</p>
          <ul className="space-y-2">
            {card.concepts.map((c) => (
              <li key={c.title} className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">{c.explanation}</p>
                <p className="text-xs text-slate-500">
                  {`Fonte: ${c.citation.label}`}
                  {c.citation.page !== null ? ` · pág. ${c.citation.page}` : ''}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-700 dark:text-slate-200">{card.objectiveLink}</p>
        </div>
      )}

      {question && (
        <QuestionBlock
          key={question.seq}
          question={question}
          answer={answer}
          onAnswer={onAnswer}
          answerPending={answerPending}
          answerError={answerError}
          onContinueInChat={onContinueInChat}
        />
      )}
    </section>
  );
}
