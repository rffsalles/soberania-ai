'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Sparkles, GraduationCap, FileSpreadsheet, Server, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PitchFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Compliance Seals Banner */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-heading text-sm font-bold text-white">
                100% LGPD & Diretrizes do MEC
              </p>
              <p className="text-xs text-slate-400">
                Auditoria local transparente com zero envio de dados de menores a terceiros.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-300">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 border border-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Hardware Homologado
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 border border-slate-700">
              <span className="h-2 w-2 rounded-full bg-brand-teal" />
              Soberania Digital
            </span>
          </div>
        </div>

        {/* Quick Links by Role for Live Demo Presentation */}
        <div className="mb-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
            Atalhos para Demonstração Presencial por Perfil:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              href="/dashboard"
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-brand-teal/50 hover:bg-slate-900 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <GraduationCap className="h-5 w-5 text-brand-teal" />
                <div>
                  <p className="text-xs font-semibold text-white group-hover:text-brand-teal transition-colors">
                    Ambiente do Aluno
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Aulas síncronas, grupos e provas
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-brand-teal transition-colors" />
            </Link>

            <Link
              href="/reports"
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-brand-orange/50 hover:bg-slate-900 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-brand-orange" />
                <div>
                  <p className="text-xs font-semibold text-white group-hover:text-brand-orange transition-colors">
                    Painel do Professor
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Atas pedagógicas e diagnósticos
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-brand-orange transition-colors" />
            </Link>

            <Link
              href="/appliance"
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-emerald-500/50 hover:bg-slate-900 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="text-xs font-semibold text-white group-hover:text-emerald-400 transition-colors">
                    Telemetria TI / Admin
                  </p>
                  <p className="text-[11px] text-slate-400">
                    vLLM, status de rede e nós
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </Link>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/80 pt-8 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-teal text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="font-heading font-semibold text-slate-300">
              Soberania AI Appliance Educacional
            </span>
          </div>

          <p>© {new Date().getFullYear()} Soberania AI. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
