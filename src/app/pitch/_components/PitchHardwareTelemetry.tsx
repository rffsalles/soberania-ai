'use client';

import React from 'react';
import { Cpu, Server, WifiOff, HardDrive, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PITCH_HARDWARE_SPECS, HardwareSpecItem } from './pitch-constants';

export function PitchHardwareTelemetry() {
  return (
    <section id="hardware" className="relative py-16 md:py-24 border-t border-slate-800/80 bg-slate-950/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center mb-12">
          <Badge
            variant="outline"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border-brand-teal/30 bg-brand-teal/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-brand-teal"
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Engenharia & Infraestrutura</span>
          </Badge>

          <h2 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Arquitetura do Appliance Plug-and-Play
          </h2>
          <p className="mt-4 max-w-2xl text-slate-400 text-sm sm:text-base leading-relaxed">
            Hardware local pré-configurado com descoberta zero-touch via mDNS (<code className="text-brand-teal">soberania.local</code>) e execução sem nuvem.
          </p>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Visual Hardware Card & Live Telemetry */}
          <div className="lg:col-span-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 backdrop-blur-md shadow-soft-xl">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold text-white">
                    Appliance Soberania AI Node #1
                  </h3>
                  <span className="text-xs text-slate-400">Rack On-Premises Dedicado</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Operacional
              </span>
            </div>

            {/* Offline Resilience Feature */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 mb-6">
              <div className="flex items-start gap-3">
                <WifiOff className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs text-white">
                    Resiliência Total a Quedas de Internet
                  </p>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Se o link de internet externo da escola cair, os alunos e professores continuam acessando as aulas, tirando dúvidas com o RAG e realizando provas normalmente pela rede local.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Telemetry Bar */}
            <div className="space-y-3 rounded-2xl bg-slate-950 p-4 border border-slate-800/80 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Motor vLLM Local:</span>
                <span className="text-emerald-400 font-semibold">Ativo (PagedAttention)</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Time-to-First-Token:</span>
                <span className="text-white font-semibold">0.82s</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Tráfego Externo de IA:</span>
                <span className="text-emerald-400 font-semibold">0 KB (100% On-Premises)</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Embeddings FastEmbed (CPU):</span>
                <span className="text-brand-teal font-semibold">0% VRAM GPU Consumida</span>
              </div>
            </div>
          </div>

          {/* Right Column: 4 Architecture Specs */}
          <div className="lg:col-span-6 space-y-4">
            {PITCH_HARDWARE_SPECS.map((spec: HardwareSpecItem) => (
              <div
                key={spec.name}
                className="flex items-start gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-soft-sm hover:border-slate-700 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-brand-teal">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-heading font-semibold text-sm text-white truncate">
                      {spec.name}
                    </h4>
                    <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-[10px] font-semibold text-brand-teal">
                      {spec.status}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-300 mt-0.5">
                    {spec.role}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {spec.spec}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
