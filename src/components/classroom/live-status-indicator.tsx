'use client';

import * as React from 'react';
import type { ClassEventsStatus } from '@/components/classroom/use-class-events';

export const LIVE_STATUS_LABEL: Record<ClassEventsStatus, string> = {
  live: 'Ao vivo',
  updating: 'Atualizando',
  offline: 'Reconectando',
};

export function LiveStatusIndicator({ status }: { status: ClassEventsStatus }) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"
    >
      <span
        aria-hidden="true"
        className={
          status === 'live'
            ? 'h-2 w-2 rounded-full bg-emerald-500 animate-pulse'
            : 'h-2 w-2 rounded-full bg-slate-400'
        }
      />
      {LIVE_STATUS_LABEL[status]}
    </span>
  );
}
