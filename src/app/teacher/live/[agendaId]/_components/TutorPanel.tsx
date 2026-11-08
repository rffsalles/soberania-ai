'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { TutorNoteCommand } from '@/components/classroom/use-live-class-actions';
import type { PulseEntry } from '@/domains/classroom/class-event-schema';
import type { TeacherTutorView } from '@/domains/classroom/class-state';
import { tutorSkipMessage } from '@/domains/classroom/tutor-policy';

export function pulseText(p: PulseEntry): string {
  if (p.answered === 0) return 'Ninguém respondeu ainda.';
  const n = p.answered === 1 ? '1 resposta' : `${p.answered} respostas`;
  if (p.kind === 'MULTIPLE_CHOICE') {
    return `${n} · ${Math.round(((p.correct ?? 0) / p.answered) * 100)}% de acerto`;
  }
  return `${n} (pergunta aberta, sem correção automática)`;
}

type Props = {
  view: TeacherTutorView;
  nextActivity: string | null;
  disabled: boolean;
  onNote(cmd: TutorNoteCommand): void;
};

export function TutorPanel({ view, nextActivity, disabled, onNote }: Props) {
  const { card, question, skipped } = view;
  return (
    <section
      aria-label="Tutora"
      className="space-y-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
    >
      <h2 className="text-base font-bold font-heading text-slate-900 dark:text-white">Tutora</h2>

      {view.status === 'IDLE' && (
        <p className="text-sm text-slate-600 dark:text-slate-300">A tutora começa quando a aula for iniciada.</p>
      )}
      {view.status === 'MUTED' && (
        <p className="text-sm text-slate-600 dark:text-slate-300">Tutora em silêncio neste passo.</p>
      )}
      {view.status === 'GENERATING' && (
        <p className="text-sm text-slate-600 dark:text-slate-300">Gerando o conteúdo da tutora…</p>
      )}

      {view.status !== 'IDLE' && card && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cartão publicado</h3>
          <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
            {card.concepts.map((c) => (
              <li key={c.title}>{c.title}</li>
            ))}
          </ul>
        </div>
      )}

      {view.status !== 'IDLE' && question && (
        <div className="space-y-1">
          {question.kind === 'MULTIPLE_CHOICE' ? (
            <>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pergunta publicada</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{question.question.enunciation}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Resposta certa: {question.question.correctKey}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Pergunta do professor publicada
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{question.text}</p>
            </>
          )}
        </div>
      )}

      {view.status !== 'IDLE' && skipped && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{tutorSkipMessage(skipped)}</p>
      )}

      {view.pulse && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pulso da turma</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{pulseText(view.pulse)}</p>
        </div>
      )}

      {view.canPublishNow && view.stepIndex !== null && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onNote({
              type: 'TEACHER_NOTE',
              stepIndex: view.stepIndex as number,
              payload: { tutor: 'PUBLISH_NOW', scope: 'STEP' },
            })
          }
        >
          Publicar agora
        </Button>
      )}

      {view.nextStepIndex !== null && !view.lessonMuted && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">Próximo passo: {nextActivity}</p>
          {view.nextStepMuted ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">A tutora ficará em silêncio no próximo passo.</p>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                onNote({
                  type: 'TEACHER_NOTE',
                  stepIndex: view.nextStepIndex as number,
                  payload: { tutor: 'MUTE', scope: 'STEP' },
                })
              }
            >
              Pular
            </Button>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          role="switch"
          checked={view.lessonMuted}
          disabled={disabled}
          onChange={() =>
            onNote({
              type: 'TEACHER_NOTE',
              payload: { tutor: view.lessonMuted ? 'UNMUTE' : 'MUTE', scope: 'LESSON' },
            })
          }
        />
        Tutora em silêncio nesta aula
      </label>
    </section>
  );
}
