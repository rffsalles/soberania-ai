'use client';

import * as React from 'react';
import { Sparkles, GraduationCap, Loader2, Lock, ShieldCheck, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProviderBadge } from '@/components/layout/provider-badge';
import { AdvancedCombobox } from '@/components/ui/advanced-combobox';
import { formatOfferingLabel } from '@/domains/academic/offering-label';
import { OfferingContextCard } from './OfferingContextCard';
import type { OfferingOption } from '../types';

export interface PlanHeaderControlsProps {
  offerings: OfferingOption[];
  selectedOfferingId: string;
  onSelectOffering: (id: string) => void;
  activeOffering: OfferingOption | null;
  /** true na edição: a oferta do plano salvo não muda. */
  offeringLocked: boolean;

  isAiLocked: boolean;
  lockReason?: string;
  isGeneratingAI: boolean;
  onGenerateAI: () => void;
}

export function PlanHeaderControls({
  offerings,
  selectedOfferingId,
  onSelectOffering,
  activeOffering,
  offeringLocked,
  isAiLocked,
  lockReason,
  isGeneratingAI,
  onGenerateAI,
}: PlanHeaderControlsProps) {
  const offeringItems = React.useMemo(
    () => offerings.map((o) => ({ id: o.id, title: formatOfferingLabel(o), subtitle: o.class.name })),
    [offerings]
  );

  return (
    <div className="space-y-5">
      {/* Top Banner & AI Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 1 do Pipeline Pedagógico
            </Badge>
            <ProviderBadge />
          </div>

          <h1 className="text-xl sm:text-2xl font-heading font-bold text-slate-900 dark:text-white">
            Plano de Ensino & Aprendizagem: {activeOffering ? activeOffering.discipline.name : 'Selecione a oferta'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {activeOffering ? (
              <>
                Curso: {activeOffering.class.course.name} | Código: {activeOffering.discipline.code} | Status: Em Elaboração
              </>
            ) : (
              'Selecione uma oferta para iniciar a elaboração do plano.'
            )}
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
          <Button
            type="button"
            onClick={onGenerateAI}
            disabled={isGeneratingAI || isAiLocked}
            className={`text-white gap-2 cursor-pointer rounded-xl shadow-soft-sm h-10 px-4 transition-all ${
              isAiLocked
                ? 'bg-slate-400 dark:bg-slate-700 opacity-60 cursor-not-allowed'
                : 'bg-brand-teal hover:bg-brand-teal-dark'
            }`}
          >
            {isGeneratingAI ? (
              <Loader2 className="h-4 w-4 animate-spin text-brand-orange" />
            ) : isAiLocked ? (
              <Lock className="h-4 w-4 text-slate-200" />
            ) : (
              <Sparkles className="h-4 w-4 text-brand-orange" />
            )}
            <span className="text-xs sm:text-sm font-semibold">
              {isGeneratingAI
                ? 'IA Socrática: Analisando RAG...'
                : isAiLocked
                ? 'IA Bloqueada (Preencha Requisitos)'
                : 'IA Socrática: Gerar Sugestão Ementa'}
            </span>
          </Button>

          {isAiLocked && lockReason && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium max-w-xs text-left md:text-right">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>{lockReason}</span>
            </span>
          )}
        </div>
      </div>

      {/* Oferta (disciplina + turma + período) e seu contexto somente leitura */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl glass border border-slate-200 dark:border-slate-800">
        <div>
          <AdvancedCombobox
            id="plan-offering-combobox"
            label="Oferta *"
            placeholder="Pesquisar oferta..."
            emptyMessage="Nenhuma oferta encontrada."
            items={offeringItems}
            selectedId={selectedOfferingId}
            onSelect={onSelectOffering}
            disabled={offeringLocked}
            icon={<GraduationCap className="h-4 w-4 text-brand-teal" />}
          />
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            Não encontra a oferta? Peça ao administrador para cadastrá-la e alocar você.
          </p>
        </div>

        <OfferingContextCard offering={activeOffering} />
      </div>
    </div>
  );
}
