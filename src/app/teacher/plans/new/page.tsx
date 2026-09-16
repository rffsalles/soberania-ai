'use client';

import * as React from 'react';
import {
  Sparkles,
  BookOpen,
  CheckCircle2,
  Save,
  ArrowRight,
  Plus,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function TeachingPlanNewPage() {
  const [syllabus, setSyllabus] = React.useState(
    'Visão geral da arquitetura de SGBDs relacionais. Modelagem conceitual com Diagramas Entidade-Relacionamento (DER). Mapeamento lógico para esquemas relacionais. Dependências funcionais e Normalização até a 3ª Forma Normal (3FN). Álgebra Relacional e Linguagem SQL DDL/DML. Transações ACID, índices e introdução a acervos RAG com bancos vetoriais.'
  );
  const [generalObjectives, setGeneralObjectives] = React.useState(
    'Capacitar o estudante a projetar, modelar e otimizar bancos de dados relacionais e vetoriais com suporte a RAG On-Premises, garantindo integridade de dados e aderência às DCNs de Computação.'
  );
  const [methodology, setMethodology] = React.useState(
    'Aulas expositivas dialéticas integradas com mediação da Tutora Lucy (IA Socrática local). Resolução orientada de problemas em duplas com sandbox PostgreSQL 16 e análises de planos de execução (EXPLAIN ANALYZE).'
  );
  const [isGeneratingAI, setIsGeneratingAI] = React.useState(false);

  const handleGenerateAI = async () => {
    setIsGeneratingAI(true);
    setTimeout(() => {
      setIsGeneratingAI(false);
    }, 1200);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Stepper */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 1 do Pipeline Pedagógico
            </Badge>
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              vLLM Local: Conectado (100% On-Premise)
            </Badge>
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Plano de Ensino & Aprendizagem: Banco de Dados I (80h)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Curso: Análise e Desenv. de Sistemas | Semestre: 2025.1 | Status: Em Elaboração
          </p>
        </div>

        <Button
          onClick={handleGenerateAI}
          disabled={isGeneratingAI}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl shadow-soft-sm"
        >
          <Sparkles className="h-4 w-4 text-brand-orange" />
          <span>{isGeneratingAI ? 'IA Gerando Ementa Local...' : 'IA Socrática: Gerar Sugestão Ementa'}</span>
        </Button>
      </div>

      {/* Main Grid Accordions / Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form Col (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Ementa Oficial */}
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-heading flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-brand-teal" />
                  1. Ementa Oficial da Disciplina
                </span>
                <Badge variant="secondary" className="text-[10px]">Indexado no RAG Local</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={syllabus}
                onChange={(e) => setSyllabus(e.target.value)}
                rows={4}
                className="rounded-xl font-sans text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          {/* Card 2: Objetivos (Taxonomia de Bloom) */}
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-orange" />
                2. Objetivos Gerais & Taxonomia de Bloom
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={generalObjectives}
                onChange={(e) => setGeneralObjectives(e.target.value)}
                rows={3}
                className="rounded-xl text-sm"
              />

              <div className="flex flex-wrap gap-2 pt-2">
                <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Nível 2: Compreender ANSI/SPARC</Badge>
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Nível 3: Aplicar SQL & Joins</Badge>
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Nível 4: Analisar 3FN & Hash</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Metodologia Socrática */}
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-teal" />
                3. Metodologia & Estratégias Socráticas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={methodology}
                onChange={(e) => setMethodology(e.target.value)}
                rows={3}
                className="rounded-xl text-sm"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Info Col (1 col) */}
        <div className="space-y-6">
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50">
            <CardHeader>
              <CardTitle className="text-sm font-heading">Conformidade NDE / MEC</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Carga Horária Total</span>
                <span className="font-bold text-slate-900">80 Horas</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Teoria / Prática</span>
                <span className="font-bold text-slate-900">60h / 20h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Alinhamento DCNs</span>
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">100% OK</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="p-4 rounded-xl border border-brand-teal/30 bg-brand-teal/5 space-y-3">
            <div className="flex items-center gap-2 text-brand-teal font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Privacidade & LGPD Garantidas</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Toda a ementa e objetivos gerados permanecem 100% dentro do servidor físico da faculdade. Zero vazamento de propriedade intelectual.
            </p>
          </div>
        </div>
      </div>

      {/* Docked Footer Bar */}
      <div className="flex items-center justify-between p-4 glass rounded-xl border border-slate-200 dark:border-slate-800">
        <span className="text-xs text-slate-500">● Salvo em rascunho no banco local</span>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl text-xs">
            Exportar PDF / MEC
          </Button>
          <Button
            onClick={() => (window.location.href = '/teacher/schedules')}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 rounded-xl text-xs cursor-pointer"
          >
            <span>Aprovar e Avançar para Cronograma (Etapa 2)</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
