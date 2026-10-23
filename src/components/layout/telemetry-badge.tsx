'use client';

import * as React from 'react';
import { Role } from '@prisma/client';
import { Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useApplianceStatus } from './use-appliance-status';

interface TelemetryBadgeProps {
  role?: Role;
}

export function TelemetryBadge({ role }: TelemetryBadgeProps) {
  const allowed = role === Role.TEACHER || role === Role.ADMIN;
  const status = useApplianceStatus(allowed);

  if (!allowed || !status) return null;

  const { avgTtftMs } = status.windows.last15m;
  const externalBytes = status.windows.last24h.externalTrafficBytes;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className="px-3 py-1 gap-1.5 font-medium">
        <span
          className={cn('inline-flex rounded-full h-2 w-2', status.healthy ? 'bg-emerald-500' : 'bg-red-500')}
          aria-label={status.healthy ? 'Provedor operacional' : 'Provedor indisponível'}
        />
        <span>{externalBytes === 0 ? '0 KB externo' : `${externalBytes} B externo`}</span>
      </Badge>

      <div className="hidden md:flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <Cpu className="h-3 w-3 text-brand-teal" />
        <span>
          {status.provider}: {avgTtftMs != null ? `TTFT ${Math.round(avgTtftMs)} ms` : 'sem chamadas'}
        </span>
      </div>
    </div>
  );
}
