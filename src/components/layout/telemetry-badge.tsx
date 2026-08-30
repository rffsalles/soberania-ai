'use client';

import * as React from 'react';
import { ShieldCheck, Cpu, HardDrive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function TelemetryBadge() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge
        variant="outline"
        className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 px-3 py-1 gap-1.5 font-medium"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>100% On-Premises · 0 KB Externo</span>
      </Badge>

      <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Cpu className="h-3 w-3 text-brand-teal" />
          vLLM 8B: 68 tok/s
        </span>
        <span>•</span>
        <span className="flex items-center gap-1">
          <HardDrive className="h-3 w-3 text-brand-orange" />
          HNSW pgvector: 14ms
        </span>
      </div>
    </div>
  );
}
