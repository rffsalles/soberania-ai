'use client';

import * as React from 'react';
import { BookMarked, CheckCircle2, FileSearch } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { isLocalProvider } from '@/lib/ai-provider';
import { useApplianceStatus } from '@/components/layout/use-appliance-status';

interface PlanTelemetryCardProps {
  citations: string[];
}

export function PlanTelemetryCard({ citations }: PlanTelemetryCardProps) {
  const status = useApplianceStatus();
  const local = status ? isLocalProvider(status.provider) : null;
  return (
    <div className="space-y-6">
      {/* RAG Citations Card */}
      <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2 text-brand-blue dark:text-blue-400">
            <BookMarked className="h-4 w-4" />
            <span>Citações Documentais RAG</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {citations.length === 0 ? (
            <div className="py-4 px-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-1 text-slate-500">
              <FileSearch className="h-5 w-5 mx-auto opacity-40 mb-1" />
              <p className="text-[11px]">
                Nenhuma citação ainda. Ao gerar o plano com a IA Socrática, as evidências e trechos recuperados das referências aparecerão aqui.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">
                Evidências e páginas recuperadas no Appliance para fundamentar a elaboração:
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {citations.map((c, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30 text-[11px] text-blue-700 dark:text-blue-300 font-mono"
                  >
                    {c}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Onde a inferência acontece: lido da telemetria, não afirmado de antemão */}
      <div
        className={
          local === false
            ? 'p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2'
            : 'p-4 rounded-xl border border-brand-teal/30 bg-brand-teal/5 space-y-2'
        }
      >
        <div className={`flex items-center gap-2 font-semibold text-xs sm:text-sm ${local === false ? 'text-amber-700' : 'text-brand-teal'}`}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Onde a IA processa este plano</span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          {local === null
            ? 'Verificando o provedor de inferência configurado...'
            : local
              ? `Inferência em ${status?.provider} dentro do appliance da instituição: ementa, referências e objetivos não saem da rede local.`
              : `Inferência em ${status?.provider} (nuvem): o conteúdo enviado para gerar a sugestão sai do appliance. Use vLLM ou Ollama locais para processamento on-premises.`}
        </p>
      </div>
    </div>
  );
}
