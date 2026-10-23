'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { API_ROUTES } from '@/lib/constants/routes';
import type { ApplianceStatus } from '@/domains/telemetry/services/telemetry-service';
import {
  Server,
  ShieldCheck,
  Cpu,
  Zap,
  Activity,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ApplianceTelemetryPage() {
  const [status, setStatus] = React.useState<ApplianceStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refreshData = React.useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch(API_ROUTES.APPLIANCE_TELEMETRY, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.status) throw new Error(data?.error ?? 'Falha ao carregar a telemetria.');
      setStatus(data.status as ApplianceStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar a telemetria.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const w15 = status?.windows.last15m;
  const w24 = status?.windows.last24h;
  const gpu = status?.gpu ?? null;
  const unavailable = 'indisponível';

  return (
    <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="teal" className="gap-1 text-xs">
                <Server className="h-3.5 w-3.5" />
                Console de Administração do Appliance
              </Badge>
              <Badge variant="outline" className="text-xs font-mono text-emerald-600 border-emerald-300">
                100% SOBERANO & AIR-GAPPED
              </Badge>
            </div>
            <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white">
              Telemetria de Hardware, Inferência & Auditoria LGPD
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Métricas calculadas a partir dos logs de inferência, saúde do provedor e VRAM da GPU NVIDIA.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={isRefreshing}
              className="gap-1.5 cursor-pointer"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              <span>{isRefreshing ? 'Atualizando...' : 'Atualizar Métricas'}</span>
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {/* 4 Cards: SOBERANIA, GPU VRAM, TTFT LATENCY, PROVEDOR */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Air-Gap Zero Egress */}
          <Card className="rounded-2xl border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Isolamento de Rede LGPD
                </span>
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <CardTitle className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 pt-1">
                {w24 ? `${w24.externalTrafficBytes} Bytes` : unavailable}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                Tráfego externo registrado nas inferências das últimas 24 h.
              </p>
            </CardContent>
          </Card>

          {/* Card 2: NVIDIA GPU VRAM */}
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  GPU NVIDIA (VRAM)
                </span>
                <Cpu className="h-5 w-5 text-brand-teal" />
              </div>
              <CardTitle className="text-2xl font-bold font-mono text-slate-900 dark:text-white pt-1">
                {gpu ? `${gpu.usedGb.toFixed(1)} / ${gpu.totalGb.toFixed(1)} GB` : unavailable}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {gpu && (
                <>
                  <Progress value={(gpu.usedGb / gpu.totalGb) * 100} className="h-2" />
                  <p className="text-[11px] text-slate-500 font-mono text-right">
                    {Math.round((gpu.usedGb / gpu.totalGb) * 100)}% alocado
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Card 3: TTFT & Vazão */}
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Latência TTFT (15 min)
                </span>
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <CardTitle className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 pt-1">
                {w15?.avgTtftMs != null ? `${Math.round(w15.avgTtftMs)} ms` : unavailable}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Vazão de Geração:</span>
                <strong className="text-slate-800 dark:text-slate-200">
                  {w15?.avgTokensPerSecond != null ? `${w15.avgTokensPerSecond.toFixed(1)} tok/s` : unavailable}
                </strong>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Provedor de inferência */}
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Provedor de Inferência</span>
                <Server className="h-5 w-5 text-brand-orange" />
              </div>
              <CardTitle className="text-base font-bold font-mono text-brand-orange truncate pt-1">
                {status ? `${status.provider} · ${status.model}` : unavailable}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500">
                {w24
                  ? `${w24.calls} chamadas em 24 h · ${w24.fallbackCount} em modo de contingência`
                  : unavailable}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Section: Server Health & Services Registry */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-bold font-heading flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-teal" />
                Microsserviços em Execução no Appliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-3 w-3 rounded-full',
                      status ? (status.healthy ? 'bg-emerald-500' : 'bg-red-500') : 'bg-slate-300',
                    )}
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Servidor de Inferência</p>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {status ? `${status.provider} · ${status.baseUrl}` : unavailable}
                    </span>
                  </div>
                </div>
                <Badge variant="teal" className="text-[10px]">
                  {status ? (status.healthy ? 'OPERACIONAL' : 'INDISPONÍVEL') : '—'}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-300">
                <span>Latência média (15 min)</span>
                <strong>{w15?.avgLatencyMs != null ? `${Math.round(w15.avgLatencyMs)} ms` : unavailable}</strong>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-300">
                <span>Chamadas (15 min)</span>
                <strong>{w15 ? w15.calls : unavailable}</strong>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-bold font-heading flex items-center gap-2">
                <Lock className="h-4 w-4 text-brand-orange" />
                Certificado de Soberania de Dados (LGPD)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Este appliance opera sob política de <strong>Zero Cloud Egress</strong> quando o provedor de inferência é local (vLLM ou Ollama). O tráfego externo registrado aparece no card de isolamento de rede.
              </p>

            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
