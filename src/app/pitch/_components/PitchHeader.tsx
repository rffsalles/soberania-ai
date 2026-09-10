'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight, Sparkles, Cpu, Layers, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PitchHeaderProps {
  onNavigateSection?: (sectionId: string) => void;
}

export function PitchHeader({ onNavigateSection }: PitchHeaderProps) {
  const scrollToSection = (id: string) => {
    if (onNavigateSection) {
      onNavigateSection(id);
      return;
    }
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo & Status Badge */}
        <div className="flex items-center gap-3">
          <Link
            href="/pitch"
            className="flex items-center gap-2.5 text-white transition-opacity hover:opacity-90 cursor-pointer"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-teal-dark shadow-sm">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-lg font-bold tracking-tight text-white">
                Soberania<span className="text-brand-orange">.AI</span>
              </span>
              <span className="text-[10px] font-medium tracking-wider text-slate-400">
                APPLIANCE EDUCACIONAL
              </span>
            </div>
          </Link>

          <Badge
            variant="outline"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <ShieldCheck className="h-3 w-3" />
            100% On-Premises
          </Badge>
        </div>

        {/* Section Anchors */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollToSection('dilemmas')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
          >
            <Layers className="h-3.5 w-3.5 text-brand-teal" />
            Os 3 Dilemas
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('agendas')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-brand-orange" />
            Multi-Agendas
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('roi-calculator')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
          >
            <Calculator className="h-3.5 w-3.5 text-emerald-400" />
            Calculadora ROI
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('hardware')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
          >
            <Cpu className="h-3.5 w-3.5 text-brand-teal" />
            Hardware & IA
          </button>
        </nav>

        {/* CTA: Direto para a Plataforma / Demonstração ao Vivo */}
        <div className="flex items-center gap-2.5">
          <Link href="/dashboard">
            <Button
              size="sm"
              className="cursor-pointer gap-2 rounded-xl bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold shadow-sm active:scale-[0.98] transition-all"
            >
              <span>Acessar Plataforma</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
