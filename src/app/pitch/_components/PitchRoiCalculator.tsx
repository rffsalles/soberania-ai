'use client';

import React, { useState } from 'react';
import { Calculator, TrendingDown, Server, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { CurrencyMath } from '@/lib/currency-math';

export function PitchRoiCalculator() {
  const [studentCount, setStudentCount] = useState<number>(3000);

  const tco = CurrencyMath.calculateTcoProjection(studentCount);

  return (
    <section id="roi-calculator" className="relative py-16 md:py-24 border-t border-slate-800/80 bg-slate-950/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center mb-12">
          <Badge
            variant="outline"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400"
          >
            <Calculator className="h-3.5 w-3.5" />
            <span>Previsibilidade Financeira</span>
          </Badge>

          <h2 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Simulador de TCO: Nuvem por Token vs Appliance Fixo
          </h2>
          <p className="mt-4 max-w-2xl text-slate-400 text-sm sm:text-base leading-relaxed">
            Veja a projeção comparativa de custos para a quantidade de alunos da sua instituição.
          </p>
        </div>

        {/* Interactive Calculator Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-10 backdrop-blur-md shadow-soft-xl max-w-5xl mx-auto">
          {/* Slider Control */}
          <div className="mb-10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="student-slider" className="font-semibold text-slate-200 text-sm sm:text-base">
                Quantidade de Alunos Atendidos:
              </label>
              <div className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-1.5 border border-slate-700">
                <span className="font-heading font-bold text-xl text-brand-orange">
                  {studentCount.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs text-slate-400">estudantes</span>
              </div>
            </div>

            {/* Range Input with styled track */}
            <div className="relative pt-2">
              <input
                id="student-slider"
                type="range"
                min="500"
                max="15000"
                step="250"
                value={studentCount}
                onChange={(e) => setStudentCount(Number(e.target.value))}
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-2">
                <span>500 alunos</span>
                <span>5.000 alunos</span>
                <span>10.000 alunos</span>
                <span>15.000 alunos</span>
              </div>
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Cloud Annual Cost */}
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                  Custo Anual Nuvem (Tokens)
                </span>
                <p className="font-heading text-2xl sm:text-3xl font-bold text-white mt-2">
                  {tco.cloudAnnualCostFormatted}
                </p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Estimado a ~150k tokens/mês por aluno em APIs públicas (US$ 3.00/M + IOF).
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-rose-900/40 text-[11px] text-rose-300 flex items-center gap-1.5">
                <span>Fatura variável em dólar</span>
              </div>
            </div>

            {/* Soberania AI Fixed Cost */}
            <div className="rounded-2xl border border-brand-teal/40 bg-brand-teal/10 p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-brand-teal uppercase tracking-wider">
                  Appliance Soberania (Comodato)
                </span>
                <p className="font-heading text-2xl sm:text-3xl font-bold text-white mt-2">
                  {tco.soberaniaAnnualCostFormatted}
                </p>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Hardware local dedicado ({tco.applianceUnits} {tco.applianceUnits > 1 ? 'nós' : 'nó'}) + suporte + software.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-brand-teal/20 text-[11px] text-brand-teal flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Perguntas Ilimitadas · Custo Fixo</span>
              </div>
            </div>

            {/* Total Annual Savings */}
            <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-slate-900 p-5 flex flex-col justify-between shadow-soft-md">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    Economia Estimada / Ano
                  </span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                    -{tco.savingsPercent}%
                  </span>
                </div>
                <p className="font-heading text-2xl sm:text-3xl font-bold text-emerald-400 mt-2">
                  {tco.annualSavingsFormatted}
                </p>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Recursos preservados no orçamento da instituição para investimentos didáticos.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-emerald-900/40 text-[11px] text-emerald-300 flex items-center gap-1.5 font-medium">
                <TrendingDown className="h-3.5 w-3.5" />
                <span>Economia imediata na escala</span>
              </div>
            </div>
          </div>

          {/* Footer Callout inside calculator */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-800">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <Server className="h-4 w-4 text-brand-orange shrink-0" />
              <span>
                Dimensionamento automático:{' '}
                <strong className="text-white">
                  {tco.applianceUnits} {tco.applianceUnits > 1 ? 'Appliances em Rack' : 'Appliance Dedicado'}
                </strong>{' '}
                com vLLM e 100% de soberania local.
              </span>
            </div>

            <Link href="/dashboard" className="w-full sm:w-auto shrink-0">
              <Button
                size="sm"
                className="w-full sm:w-auto cursor-pointer gap-2 rounded-xl bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold text-xs shadow-sm transition-all"
              >
                <span>Acessar Demonstração</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
