'use client';

import * as React from 'react';
import { Role } from '@prisma/client';
import { Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { API_ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';
import type { ApplianceStatus } from '@/domains/telemetry/services/telemetry-service';

interface TelemetryBadgeProps {
  role?: Role;
}

export function TelemetryBadge({ role }: TelemetryBadgeProps) {
  const allowed = role === Role.TEACHER || role === Role.ADMIN;
  const [status, setStatus] = React.useState<ApplianceStatus | null>(null);

  React.useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    fetch(API_ROUTES.APPLIANCE_TELEMETRY)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.status) setStatus(data.status as ApplianceStatus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [allowed]);

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
