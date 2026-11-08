'use client';

import * as React from 'react';
import { LiveStatusIndicator } from '@/components/classroom/live-status-indicator';
import type { ClassEventsStatus } from '@/components/classroom/use-class-events';

interface NowInClassStripProps {
  stepIndex: number | null;
  activity: string | null;
  status: ClassEventsStatus;
}

export function NowInClassStrip({ stepIndex, activity, status }: NowInClassStripProps) {
  if (stepIndex === null) return null;
  return (
    <section
      data-testid="now-in-class-strip"
      aria-label="Agora na aula"
      className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-brand-teal/40 shadow-xs"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">Agora na aula</p>
        <p className="text-base font-semibold text-slate-900 dark:text-white">
          {activity ?? `Passo ${stepIndex + 1}`}
        </p>
      </div>
      <LiveStatusIndicator status={status} />
    </section>
  );
}
