'use client';

import * as React from 'react';
import {
  FileCheck2,
  TrendingUp,
  AlertCircle,
  Award,
  BookOpen,
  Printer,
  Download,
} from 'lucide-react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { generateClassMinute } from '@/domains/pedagogy/minutes-generator';
import type { ClassMinuteData } from '@/domains/pedagogy/types';

interface PedagogicalMinutesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendaId?: string;
  sessionTitle?: string;
}

export function PedagogicalMinutesModal({
  open,
  onOpenChange,
  agendaId = 'session-live-01',
  sessionTitle = 'Modelagem Conceitual e Álgebra Relacional (JOINs)',
}: PedagogicalMinutesModalProps) {
  const [minute, setMinute] = React.useState<ClassMinuteData | null>(null);

  React.useEffect(() => {
    if (open) {
      const generated = generateClassMinute({
        agendaId,
        sessionTitle,
        studentId: 'usr-student-01',
        studentName: 'Lucas Ferreira',
        questionsCount: 4,
        challengesCount: 2,
      });
      setMinute(generated);
    }
  }, [open, agendaId, sessionTitle]);

  if (!minute) return null;

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Ata Pedagógica Individual"
      description="Síntese gerada pela Profª. Luci ao término da aula síncrona."
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Fechar
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 cursor-pointer"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir</span>
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
              onClick={() => onOpenChange(false)}
            >
              <Download className="h-4 w-4" />
              <span>Salvar PDF</span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        {/* Metadados da Sessão */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs text-slate-500 font-medium">Estudante</span>
            <p className="font-semibold text-slate-900 dark:text-white">
              {minute.studentName}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Disciplina</span>
            <p className="font-semibold text-slate-900 dark:text-white">
              Banco de Dados I
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Status</span>
            <div className="pt-0.5">
              <Badge variant="teal" className="text-xs">
                Ata Homologada
              </Badge>
            </div>
          </div>
        </div>

        {/* Scores de Engajamento e Hesitação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" />
                Score de Engajamento
              </span>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {minute.engagementScore}%
              </span>
            </div>
            <Progress value={minute.engagementScore} className="h-2 bg-emerald-100" />
            <p className="text-[11px] text-slate-500">
              {minute.totalQuestionsAsked} dúvidas enviadas · {minute.socraticChallengesAnswered} desafios respondidos
            </p>
          </div>

          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                Índice de Hesitação
              </span>
              <span className="text-lg font-bold text-amber-700 dark:text-amber-300">
                {minute.hesitationIndex}%
              </span>
            </div>
            <Progress value={minute.hesitationIndex} className="h-2 bg-amber-100" />
            <p className="text-[11px] text-slate-500">
              Média de 14s de reflexão antes de submeter respostas
            </p>
          </div>
        </div>

        {/* Tópicos Dominados vs Dificuldades */}
        <div className="space-y-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
              <Award className="h-4 w-4 text-brand-teal" />
              Conceitos Dominados na Sessão
            </span>
            <div className="flex flex-wrap gap-1.5">
              {minute.topicsMastered.map((topic) => (
                <Badge key={topic} variant="teal" className="text-xs py-1">
                  {topic}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
              <AlertCircle className="h-4 w-4 text-brand-orange" />
              Pontos de Atenção Pedagógica
            </span>
            <div className="flex flex-wrap gap-1.5">
              {minute.topicsStruggled.map((topic) => (
                <Badge key={topic} variant="amber" className="text-xs py-1">
                  {topic}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Parecer Narrativo & Recomendações */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
          <span className="text-xs font-semibold text-brand-teal flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            Parecer Formativo da Profª. Luci
          </span>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {minute.rawSummary}
          </p>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-brand-orange font-medium">
            💡 <strong>Próximo Passo:</strong> {minute.actionableAdvice}
          </div>
        </div>
      </div>
    </AdaptiveModal>
  );
}
