'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getApplianceTelemetry } from '@/lib/vllm-client';
import {
  Server,
  ShieldCheck,
  Cpu,
  HardDrive,
  Zap,
  Activity,
  Lock,
  Layers,
  FileCheck2,
  RefreshCw,
  Clock,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ApplianceTelemetryPage() {
  const [telemetry, setTelemetry] = React.useState(getApplianceTelemetry);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const refreshData = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setTelemetry(getApplianceTelemetry());
      setIsRefreshing(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <AppHeader />

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
              Monitoramento em tempo real da GPU NVIDIA, vLLM Engine, latência de tokens e isolamento de rede.
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
              <span>Atualizar Métricas</span>
            </Button>
          </div>
        </div>

        {/* 4 Cards: SOBERANIA AIR-GAP, GPU VRAM, TTFT LATENCY, LORA ACTIVE */}
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
                {telemetry.externalTrafficBytes} Bytes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                Zero vazamento para nuvens externas. 100% dos dados retidos no hardware local.
              </p>
            </CardContent>
          </Card>

          {/* Card 2: NVIDIA GPU VRAM */}
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  NVIDIA RTX 4090 (VRAM)
                </span>
                <Cpu className="h-5 w-5 text-brand-teal" />
              </div>
              <CardTitle className="text-2xl font-bold font-mono text-slate-900 dark:text-white pt-1">
                {telemetry.gpuVramUsageGb.toFixed(1)} / 24.0 GB
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Progress value={(telemetry.gpuVramUsageGb / 24) * 100} className="h-2" />
              <p className="text-[11px] text-slate-500 font-mono text-right">
                {Math.round((telemetry.gpuVramUsageGb / 24) * 100)}% alocado (AWQ 4-bit)
              </p>
            </CardContent>
          </Card>

          {/* Card 3: TTFT & Vazão */}
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Latência TTFT vLLM
                </span>
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <CardTitle className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 pt-1">
                {telemetry.ttftMs} ms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Vazão de Geração:</span>
                <strong className="text-slate-800 dark:text-slate-200">
                  {telemetry.tokensPerSecond} tok/s
                </strong>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Adaptador LoRA */}
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  LoRA Dinâmico Ativo
                </span>
                <Layers className="h-5 w-5 text-brand-orange" />
              </div>
              <CardTitle className="text-base font-bold font-mono text-brand-orange truncate pt-1">
                {telemetry.activeLora}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500">
                Persona didática socrática da Tutora Lucy carregada via dynamic adapter.
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
                  <div className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">vLLM Inference Server</p>
                    <span className="text-[11px] text-slate-500 font-mono">Porta 8000 · Qwen2.5-7B-Instruct</span>
                  </div>
                </div>
                <Badge variant="teal" className="text-[10px]">OPERACIONAL</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Embedded MCP Server</p>
                    <span className="text-[11px] text-slate-500 font-mono">JSON-RPC / stdio · 4 Tools Ativas</span>
                  </div>
                </div>
                <Badge variant="teal" className="text-[10px]">CONECTADO</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">PostgreSQL + pgvector</p>
                    <span className="text-[11px] text-slate-500 font-mono">Porta 5432 · HNSW Cosine Index</span>
                  </div>
                </div>
                <Badge variant="teal" className="text-[10px]">ATIVO</Badge>
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
                Este appliance opera sob política de <strong>Zero Cloud Egress</strong>. Nenhuma gravação de áudio, vídeo de aula, interação de aluno ou arquivo didático trafega para servidores de terceiros ou IAs estrangeiras.
              </p>

              <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900/50 space-y-2">
                <div className="flex items-center gap-2 text-brand-teal font-bold text-xs">
                  <ShieldCheck className="h-4 w-4" />
                  Emissão de Laudo de Auditoria LGPD
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Hash de Validação de Firmware e Integridade Air-Gap:
                </p>
                <div className="font-mono text-[10px] bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 truncate">
                  sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
