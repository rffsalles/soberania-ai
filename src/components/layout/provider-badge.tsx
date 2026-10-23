'use client';

import * as React from 'react';
import { Cpu, Cloud, CircleHelp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { isLocalProvider } from '@/lib/ai-provider';
import { useApplianceStatus } from './use-appliance-status';

/**
 * Selo do provedor de inferência configurado, lido da telemetria: nunca afirma "on-premises"
 * quando a inferência está em um provedor de nuvem.
 */
export function ProviderBadge() {
  const status = useApplianceStatus();

  if (!status) {
    return (
      <Badge variant="outline" className="text-xs text-slate-500 flex items-center gap-1">
        <CircleHelp className="h-3 w-3" />
        <span>Provedor de IA: verificando...</span>
      </Badge>
    );
  }

  if (status.provider === 'mock') {
    return (
      <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20 flex items-center gap-1">
        <CircleHelp className="h-3 w-3" />
        <span>Sem provedor de IA configurado</span>
      </Badge>
    );
  }

  const local = isLocalProvider(status.provider);
  const health = status.healthy ? 'conectado' : 'indisponível';
  return (
    <Badge
      className={
        local
          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 flex items-center gap-1'
          : 'bg-sky-500/10 text-sky-700 border-sky-500/20 flex items-center gap-1'
      }
    >
      {local ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
      <span>
        {local ? `${status.provider} local (on-premises)` : `${status.provider} em nuvem`} · {status.model} · {health}
      </span>
    </Badge>
  );
}
