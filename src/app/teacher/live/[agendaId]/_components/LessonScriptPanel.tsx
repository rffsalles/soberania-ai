'use client';

import * as React from 'react';
import { stepTarget, type LiveControls } from '@/domains/classroom/live-controls';
import type { TimeScriptItem } from '@/domains/teaching/time-script';

export function LessonScriptPanel({
  script,
  controls,
  onGoTo,
}: {
  script: TimeScriptItem[];
  controls: LiveControls;
  onGoTo(stepIndex: number): void;
}) {
  return (
    <ol aria-label="Roteiro da aula" className="space-y-2">
      {script.map((item, i) => {
        const target = stepTarget(controls, i);
        const current = controls.highlightedIndex === i;
        return (
          <li key={i}>
            <button
              type="button"
              disabled={target === null}
              aria-current={current ? 'step' : undefined}
              onClick={() => target !== null && onGoTo(target)}
              className={`w-full text-left rounded-xl border px-4 py-3 transition-colors disabled:cursor-default ${
                current
                  ? 'border-brand-orange bg-brand-orange/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 enabled:hover:bg-slate-50 dark:enabled:hover:bg-slate-800'
              }`}
            >
              <span className="block text-xs font-medium text-slate-500">{item.timeRange}</span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-white">{item.activity}</span>
              <span className="block text-sm text-slate-600 dark:text-slate-300">{item.description}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
