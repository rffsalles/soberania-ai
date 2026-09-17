'use client';

import * as React from 'react';
import { Sparkles, GraduationCap, Calendar, Loader2, Lock, ShieldCheck, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdvancedCombobox } from '@/components/ui/advanced-combobox';
import { SubjectCreateInlineModal } from './SubjectCreateInlineModal';
import { PeriodCreateInlineModal } from './PeriodCreateInlineModal';
import type { SubjectOption, AcademicPeriodOption } from '../types';

interface PlanHeaderControlsProps {
  subjects: SubjectOption[];
  selectedSubjectId: string;
  onSelectSubjectId: (id: string) => void;
  onSubjectCreated: (subject: SubjectOption) => void;
  activeSubject: SubjectOption | null;

  periods: AcademicPeriodOption[];
  selectedPeriodId: string;
  onSelectPeriodId: (id: string) => void;
  onPeriodCreated: (period: AcademicPeriodOption) => void;
  effectivePeriodName: string;

  isAiLocked: boolean;
  lockReason?: string;
  isGeneratingAI: boolean;
  onGenerateAI: () => void;
}

export function PlanHeaderControls({
  subjects,
  selectedSubjectId,
  onSelectSubjectId,
  onSubjectCreated,
  activeSubject,
  periods,
  selectedPeriodId,
  onSelectPeriodId,
  onPeriodCreated,
  effectivePeriodName,
  isAiLocked,
  lockReason,
  isGeneratingAI,
  onGenerateAI,
}: PlanHeaderControlsProps) {
  const [isSubjectModalOpen, setIsSubjectModalOpen] = React.useState(false);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = React.useState(false);

  // Map subjects to combobox items
  const subjectItems = React.useMemo(() => {
    return subjects.map((s) => ({
      id: s.id,
      title: s.name,
      subtitle: `${s.code} · ${s.courseName}`,
      badge: s.code,
    }));
  }, [subjects]);

  // Map periods to combobox items
  const periodItems = React.useMemo(() => {
    return periods.map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: `Código: ${p.code} · Regime ${p.type || 'Semestral'}`,
      badge: `${p.year}`,
    }));
  }, [periods]);

  const handleSubjectCreated = (newSubject: SubjectOption) => {
    onSubjectCreated(newSubject);
    onSelectSubjectId(newSubject.id);
  };

  const handlePeriodCreated = (newPeriod: AcademicPeriodOption) => {
    onPeriodCreated(newPeriod);
    onSelectPeriodId(newPeriod.id);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & AI Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 1 do Pipeline Pedagógico
            </Badge>
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              <span>vLLM Local: Conectado (100% On-Premise)</span>
            </Badge>
            {effectivePeriodName && (
              <Badge variant="secondary" className="text-[10px] text-slate-600 dark:text-slate-300">
                Período: {effectivePeriodName}
              </Badge>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-heading font-bold text-slate-900 dark:text-white">
            Plano de Ensino & Aprendizagem: {activeSubject ? activeSubject.name : 'Selecione a Disciplina'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {activeSubject ? (
              <>
                Curso: {activeSubject.courseName} | Código: {activeSubject.code} | Status: Em Elaboração
              </>
            ) : (
              'Vincule uma disciplina e período letivo válidos para iniciar a elaboração do plano.'
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

      {/* Advanced Combobox Controls: Subject & Academic Period */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl glass border border-slate-200 dark:border-slate-800">
        <div>
          <AdvancedCombobox
            label="Disciplina Vinculada *"
            placeholder="Pesquisar disciplina..."
            emptyMessage="Nenhuma disciplina encontrada."
            items={subjectItems}
            selectedId={selectedSubjectId}
            onSelect={onSelectSubjectId}
            addNewLabel="Cadastrar nova disciplina..."
            onAddNewClick={() => setIsSubjectModalOpen(true)}
            icon={<GraduationCap className="h-4 w-4 text-brand-teal" />}
          />
        </div>

        <div>
          <AdvancedCombobox
            label="Período Letivo / Semestre *"
            placeholder="Pesquisar período letivo..."
            emptyMessage="Nenhum período letivo encontrado."
            items={periodItems}
            selectedId={selectedPeriodId}
            onSelect={onSelectPeriodId}
            addNewLabel="Cadastrar novo período letivo..."
            onAddNewClick={() => setIsPeriodModalOpen(true)}
            icon={<Calendar className="h-4 w-4 text-brand-teal" />}
          />
        </div>
      </div>

      {/* Modals for Inline Creation */}
      <SubjectCreateInlineModal
        open={isSubjectModalOpen}
        onOpenChange={setIsSubjectModalOpen}
        onCreated={handleSubjectCreated}
      />

      <PeriodCreateInlineModal
        open={isPeriodModalOpen}
        onOpenChange={setIsPeriodModalOpen}
        onCreated={handlePeriodCreated}
      />
    </div>
  );
}
