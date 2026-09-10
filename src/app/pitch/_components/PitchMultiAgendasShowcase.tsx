'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  ShieldAlert,
  GraduationCap,
  Users,
  Clock,
  HelpCircle,
  FileCheck,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PITCH_MULTI_AGENDAS, MultiAgendaShowcaseItem } from './pitch-constants';

export function PitchMultiAgendasShowcase() {
  const [activeTab, setActiveTab] = useState<string>(PITCH_MULTI_AGENDAS[0].id);

  const getAgendaIcon = (id: string) => {
    switch (id) {
      case 'agenda-sync-class':
        return <GraduationCap className="h-4 w-4 text-brand-teal" />;
      case 'agenda-study-group':
        return <Users className="h-4 w-4 text-brand-orange" />;
      case 'agenda-safe-exam':
        return <ShieldAlert className="h-4 w-4 text-rose-400" />;
      case 'agenda-essay-mentor':
        return <FileCheck className="h-4 w-4 text-brand-teal" />;
      case 'agenda-ondemand-qa':
      default:
        return <HelpCircle className="h-4 w-4 text-emerald-400" />;
    }
  };

  return (
    <section id="agendas" className="relative py-16 md:py-24 border-t border-slate-800/80 bg-slate-950/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-12">
          <Badge
            variant="outline"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border-brand-orange/30 bg-brand-orange/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-brand-orange"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Intencionalidade Pedagógica</span>
          </Badge>

          <h2 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
            As 5 Multi-Agendas Especializadas do Professor IA
          </h2>
          <p className="mt-4 max-w-2xl text-slate-400 text-sm sm:text-base leading-relaxed">
            Em vez de um chatbot genérico que dá respostas prontas, a IA assume papéis didáticos estruturados que guiam e desafiam o estudante.
          </p>
        </div>

        {/* Tabs Control */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center mb-8">
            <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto p-1.5 rounded-2xl bg-slate-900 border border-slate-800 max-w-4xl gap-1">
              {PITCH_MULTI_AGENDAS.map((agenda: MultiAgendaShowcaseItem) => (
                <TabsTrigger
                  key={agenda.id}
                  value={agenda.id}
                  className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:shadow-sm transition-all cursor-pointer"
                >
                  {getAgendaIcon(agenda.id)}
                  <span className="truncate">{agenda.tabTitle}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Tab Content Display */}
          {PITCH_MULTI_AGENDAS.map((agenda: MultiAgendaShowcaseItem) => (
            <TabsContent key={agenda.id} value={agenda.id} className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm shadow-soft-xl">
                {/* Left Col: Explanations & Features */}
                <div className="lg:col-span-5 space-y-6">
                  <div>
                    <Badge
                      variant="outline"
                      className="mb-2 inline-flex items-center gap-1.5 rounded-full border-brand-teal/30 bg-brand-teal/10 px-3 py-0.5 text-[11px] font-semibold text-brand-teal uppercase tracking-wider"
                    >
                      {agenda.badge}
                    </Badge>
                    <h3 className="font-heading text-2xl font-bold text-white tracking-tight">
                      {agenda.title}
                    </h3>
                    <p className="mt-2.5 text-sm text-slate-300 leading-relaxed">
                      {agenda.description}
                    </p>
                  </div>

                  {/* Bullet points */}
                  <div className="space-y-2.5 border-t border-slate-800/80 pt-4">
                    {agenda.features.map((feat: string) => (
                      <div key={feat} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA link to experience the role */}
                  <div className="pt-2">
                    <Link href="/dashboard">
                      <Button
                        size="sm"
                        className="cursor-pointer gap-2 rounded-xl bg-brand-teal hover:bg-brand-teal-dark text-white font-semibold text-xs transition-all active:scale-[0.98]"
                      >
                        <span>Ver Módulo ao Vivo</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Right Col: Interactive Simulated Chat / Mockup */}
                <div className="lg:col-span-7">
                  <div className="rounded-2xl border border-slate-700/80 bg-slate-950 p-5 shadow-inner">
                    {/* Simulated Mockup Header Bar */}
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-semibold text-slate-300">
                          {agenda.mockup.tagLabel}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">
                        Sessão Local vLLM
                      </span>
                    </div>

                    {/* Chat Flow */}
                    <div className="space-y-4">
                      {/* Student Message */}
                      <div className="flex justify-end">
                        <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-brand-teal px-4 py-2.5 text-xs sm:text-sm text-white shadow-sm leading-relaxed">
                          <p className="font-medium text-[10px] text-brand-teal-light mb-0.5">Aluno (Lucas)</p>
                          <p>{agenda.mockup.samplePrompt}</p>
                        </div>
                      </div>

                      {/* AI Agent Response */}
                      <div className="flex justify-start">
                        <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-slate-800 bg-slate-900 px-4 py-3 text-xs sm:text-sm text-slate-200 shadow-sm leading-relaxed">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange/20 text-brand-orange text-[10px] font-bold">
                              IA
                            </div>
                            <span className="text-xs font-semibold text-brand-orange">
                              Agente Tutor Soberania
                            </span>
                          </div>
                          <p>{agenda.mockup.sampleResponse}</p>

                          {/* Citation Chip if available */}
                          {agenda.mockup.citationText && (
                            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-brand-teal">
                              <span className="flex items-center gap-1.5 font-medium">
                                <BookOpen className="h-3 w-3" />
                                {agenda.mockup.citationText}
                              </span>
                              <span className="text-[10px] text-slate-500">98% Aderência RAG</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
