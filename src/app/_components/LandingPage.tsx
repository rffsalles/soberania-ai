'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  ShieldCheck,
  Server,
  BookOpen,
  Sparkles,
  ArrowRight,
  Lock,
  FileCheck2,
  Cpu,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-brand-teal selection:text-white relative overflow-hidden">
      {/* Background Decorative Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-teal/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[400px] right-[-100px] w-[500px] h-[500px] bg-brand-orange/10 blur-[140px] rounded-full pointer-events-none" />

      {/* Top Institutional Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-teal-dark text-white shadow-md">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-bold text-white tracking-tight text-lg">
                  Soberania <span className="text-brand-orange">AI</span>
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-brand-teal/10 text-brand-teal border-brand-teal/30 uppercase font-semibold">
                  On-Premises
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Tutora Lucy · Apoio Docente Institucional
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/pitch">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-300 hover:text-white hover:bg-slate-850 cursor-pointer"
              >
                Apresentação Executiva
              </Button>
            </Link>

            <Link href="/login">
              <Button
                size="sm"
                className="gap-1.5 bg-brand-teal hover:bg-brand-teal-dark text-white text-xs font-semibold px-4 cursor-pointer shadow-sm rounded-lg"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Entrar na Plataforma</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 mb-8 shadow-inner">
            <ShieldCheck className="h-4 w-4 text-brand-teal" />
            <span>100% LGPD & Zero-Egress · Hardware Local para Instituições de Ensino</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-extrabold text-white tracking-tight leading-[1.15] mb-6">
            Inteligência Artificial Soberana para a{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-teal to-teal-400">
              Educação Brasileira
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed font-normal">
            A primeira plataforma acadêmica que opera modelos de linguagem (SLMs) diretamente no hardware
            local da sua instituição. Privacidade absoluta dos alunos, tutor socrático baseado em bibliografia
            oficial e custo zero de tráfego de dados internacional.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2 bg-brand-teal hover:bg-brand-teal-dark text-white font-semibold text-sm px-6 h-12 rounded-xl shadow-lg shadow-brand-teal/20 cursor-pointer"
              >
                <Lock className="h-4 w-4" />
                <span>Acessar com Matrícula ou E-mail</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            <Link href="/pitch" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto gap-2 border-slate-750 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-sm px-6 h-12 rounded-xl cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-brand-orange" />
                <span>Ver Pitch do Produto</span>
              </Button>
            </Link>
          </div>
        </section>

        {/* 4 Value Pillars */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold text-white tracking-tight">
              Pilares da Soberania Tecnológica Acadêmica
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Segurança jurídica, pedagógica e infraestrutural para universidades e colégios.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-brand-teal/40 transition-colors flex flex-col">
              <div className="h-10 w-10 rounded-xl bg-brand-teal/10 text-brand-teal flex items-center justify-center mb-4">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2 font-heading">
                Privacidade & Zero-Egress
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed flex-1">
                Todas as conversas, dúvidas e redações de alunos permanecem dentro do servidor da instituição,
                em conformidade irrestrita com a LGPD e sem envio de PII para nuvens no exterior.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-brand-teal/40 transition-colors flex flex-col">
              <div className="h-10 w-10 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center mb-4">
                <BookOpen className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2 font-heading">
                RAG de Bibliografia Oficial
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed flex-1">
                A IA responde referenciando página, capítulo e autor dos livros adotados na ementa e artigos
                científicos nacionais (RBIE/SBC, IEEE TLT), eliminando alucinações.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-brand-teal/40 transition-colors flex flex-col">
              <div className="h-10 w-10 rounded-xl bg-brand-teal/10 text-brand-teal flex items-center justify-center mb-4">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2 font-heading">
                Tutor Socrático & Anti-Cola
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed flex-1">
                O tutor não fornece o código ou a resposta pronta. Ele faz perguntas reflexivas que guiam o aluno
                e aciona guardrails rígidos caso o estudante tente burlar avaliações.
              </p>
            </div>

            {/* Card 4 */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-brand-teal/40 transition-colors flex flex-col">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2 font-heading">
                Atas Pedagógicas para Docentes
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed flex-1">
                Geração automática de minutas e relatórios de hesitação de cada aula, permitindo que os
                professores identifiquem com precisão cirúrgica os conteúdos que precisam de reforço.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 px-4 text-center bg-slate-950 text-xs text-slate-500">
        <p className="max-w-md mx-auto">
          Soberania AI · Arquitetura de Inteligência Artificial Local e Segura para Instituições Educacionais.
        </p>
      </footer>
    </div>
  );
}
