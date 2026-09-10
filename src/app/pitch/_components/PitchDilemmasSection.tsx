'use client';

import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, CloudOff, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PITCH_DILEMMAS, DilemmaItem } from './pitch-constants';

export function PitchDilemmasSection() {
  return (
    <section id="dilemmas" className="relative py-16 md:py-24 border-t border-slate-800/80 bg-slate-950/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center mb-12">
          <Badge
            variant="outline"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border-brand-teal/30 bg-brand-teal/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-brand-teal"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Diagnóstico do Setor</span>
          </Badge>

          <h2 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Os 3 Grandes Dilemas da IA Escolar vs a Solução Soberania
          </h2>
          <p className="mt-4 max-w-2xl text-slate-400 text-sm sm:text-base leading-relaxed">
            Por que as soluções de IA em nuvem pública falham na realidade das escolas públicas e privadas.
          </p>
        </div>

        {/* 3 Comparative Cards */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PITCH_DILEMMAS.map((dilemma: DilemmaItem) => (
            <div
              key={dilemma.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-sm shadow-soft-md hover:border-slate-700 transition-all duration-300"
            >
              <div>
                {/* Category Header */}
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                    {dilemma.category}
                  </span>
                </div>

                {/* Cloud Problem Block */}
                <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 mb-4">
                  <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs mb-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                    <span>Nuvem Pública (OpenAI / Google)</span>
                  </div>
                  <p className="text-xs font-medium text-slate-300 mb-1">
                    {dilemma.cloudIssue.title}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {dilemma.cloudIssue.description}
                  </p>
                </div>

                {/* Soberania AI Solution Block */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>Soberania AI (Appliance On-Premises)</span>
                  </div>
                  <p className="text-xs font-medium text-white mb-1">
                    {dilemma.soberaniaSolution.title}
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {dilemma.soberaniaSolution.description}
                  </p>
                </div>
              </div>

              {/* Highlight Footer Pill */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] font-medium text-brand-teal">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>{dilemma.soberaniaSolution.highlight}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
