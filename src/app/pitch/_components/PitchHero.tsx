'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Calculator, ShieldCheck, Zap, BookOpen, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PITCH_HERO_METRICS, MetricCardItem } from './pitch-constants';

interface PitchHeroProps {
  onScrollToRoi?: () => void;
}

export function PitchHero({ onScrollToRoi }: PitchHeroProps) {
  const getMetricIcon = (id: string) => {
    switch (id) {
      case 'data-privacy':
        return <Lock className="h-5 w-5 text-emerald-400" />;
      case 'ttft-latency':
        return <Zap className="h-5 w-5 text-brand-orange" />;
      case 'rag-accuracy':
        return <BookOpen className="h-5 w-5 text-brand-teal" />;
      case 'fixed-cost':
      default:
        return <ShieldCheck className="h-5 w-5 text-emerald-400" />;
    }
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24">
      {/* Background Decorative Ambient Glows */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-radial from-brand-teal/15 via-brand-orange/5 to-transparent blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          {/* Category Pill Badge */}
          <Badge
            variant="outline"
            className="mb-6 inline-flex items-center gap-2 rounded-full border-brand-orange/30 bg-brand-orange/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-orange"
          >
            <ShieldCheck className="h-4 w-4 text-brand-orange" />
            <span>Infraestrutura On-Premises · 100% Soberana</span>
          </Badge>

          {/* Display Hero Title */}
          <h1 className="max-w-4xl font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.15]">
            A Primeira IA Educacional{' '}
            <span className="bg-gradient-to-r from-brand-teal via-emerald-400 to-brand-orange bg-clip-text text-transparent">
              Soberana
            </span>{' '}
            em Appliance Plug-and-Play
          </h1>

          {/* Subtitle / Lead */}
          <p className="mt-6 max-w-2xl text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            Elimine riscos de vazamento da <strong className="text-white">LGPD</strong>, previsibilidade de tokens dolarizados e chatbots genéricos que incentivam a cola. Uma solução local de hardware com{' '}
            <strong className="text-white">Multi-Agendas Pedagógicas</strong>, RAG Híbrido e Atas Automáticas.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto cursor-pointer gap-2.5 rounded-xl bg-brand-teal hover:bg-brand-teal-dark text-white font-semibold text-base px-6 h-12 shadow-sm transition-all active:scale-[0.98]"
              >
                <span>Acessar Demonstração ao Vivo</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            <Button
              size="lg"
              variant="outline"
              onClick={onScrollToRoi}
              className="w-full sm:w-auto cursor-pointer gap-2.5 rounded-xl border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white font-semibold text-base px-6 h-12 transition-all active:scale-[0.98]"
            >
              <Calculator className="h-4 w-4 text-emerald-400" />
              <span>Comparar Custos vs Cloud</span>
            </Button>
          </div>
        </div>

        {/* 4 Floating Metric Cards with Micro-Pulse */}
        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PITCH_HERO_METRICS.map((metric: MetricCardItem) => (
            <div
              key={metric.id}
              className="group relative flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 backdrop-blur-sm shadow-soft-md hover:border-brand-teal/50 hover:bg-slate-900/90 transition-all duration-300"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 group-hover:bg-brand-teal/10 transition-colors">
                    {getMetricIcon(metric.id)}
                  </div>
                  <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-slate-300">
                    {metric.badge}
                  </span>
                </div>

                <p className="font-heading text-3xl font-bold tracking-tight text-white group-hover:text-brand-teal transition-colors">
                  {metric.value}
                </p>
                <p className="mt-1 font-semibold text-sm text-slate-200">
                  {metric.label}
                </p>
              </div>

              <p className="mt-3 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
                {metric.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
