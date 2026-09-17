'use client';

import * as React from 'react';
import { BookOpen, Sparkles, Layers } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface PlanEditorFormProps {
  syllabus: string;
  onChangeSyllabus: (val: string) => void;
  generalObjectives: string;
  onChangeGeneralObjectives: (val: string) => void;
  bloomBadges: string[];
  methodology: string;
  onChangeMethodology: (val: string) => void;
  isAiLocked: boolean;
}

export function PlanEditorForm({
  syllabus,
  onChangeSyllabus,
  generalObjectives,
  onChangeGeneralObjectives,
  bloomBadges,
  methodology,
  onChangeMethodology,
  isAiLocked,
}: PlanEditorFormProps) {
  return (
    <div className="space-y-6">
      {/* Card 1: Ementa Oficial */}
      <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-900 dark:text-white">
              <BookOpen className="h-4 w-4 text-brand-teal" />
              <span>1. Ementa Oficial da Disciplina</span>
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {syllabus ? 'Fundamentado no RAG Local' : 'Pendente de Elaboração'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <label htmlFor="syllabus-input" className="sr-only">
            Ementa Oficial da Disciplina
          </label>
          <Textarea
            id="syllabus-input"
            aria-label="Ementa Oficial da Disciplina"
            placeholder={
              isAiLocked
                ? 'Preencha a disciplina, período letivo e vincule ao menos 1 referência para habilitar a IA Socrática, ou digite manualmente...'
                : 'Clique no botão "IA Socrática: Gerar Sugestão Ementa" acima ou digite a ementa manualmente...'
            }
            value={syllabus}
            onChange={(e) => onChangeSyllabus(e.target.value)}
            rows={4}
            className="rounded-xl font-sans text-xs sm:text-sm leading-relaxed"
          />
        </CardContent>
      </Card>

      {/* Card 2: Objetivos & Bloom */}
      <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading flex items-center gap-2 text-slate-900 dark:text-white">
            <Sparkles className="h-4 w-4 text-brand-orange" />
            <span>2. Objetivos Gerais & Taxonomia de Bloom</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label htmlFor="objectives-input" className="sr-only">
            Objetivos Gerais e Taxonomia de Bloom
          </label>
          <Textarea
            id="objectives-input"
            aria-label="Objetivos Gerais e Taxonomia de Bloom"
            placeholder="Defina os objetivos gerais e competências essenciais que o aluno desenvolverá..."
            value={generalObjectives}
            onChange={(e) => onChangeGeneralObjectives(e.target.value)}
            rows={3}
            className="rounded-xl text-xs sm:text-sm"
          />

          {bloomBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {bloomBadges.map((badge, idx) => (
                <Badge
                  key={idx}
                  className={`text-[11px] ${
                    idx === 0
                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      : idx === 1
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  }`}
                >
                  {badge}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 3: Metodologia Socrática */}
      <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading flex items-center gap-2 text-slate-900 dark:text-white">
            <Layers className="h-4 w-4 text-brand-teal" />
            <span>3. Metodologia & Estratégias Socráticas</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <label htmlFor="methodology-input" className="sr-only">
            Metodologia e Estratégias Socráticas
          </label>
          <Textarea
            id="methodology-input"
            aria-label="Metodologia e Estratégias Socráticas"
            placeholder="Descreva as práticas pedagógicas ativas, dinâmicas de sala de aula e mediação socrática..."
            value={methodology}
            onChange={(e) => onChangeMethodology(e.target.value)}
            rows={3}
            className="rounded-xl text-xs sm:text-sm"
          />
        </CardContent>
      </Card>
    </div>
  );
}
