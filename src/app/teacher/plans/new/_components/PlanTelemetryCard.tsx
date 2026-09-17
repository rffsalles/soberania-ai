'use client';

import * as React from 'react';
import { BookMarked, CheckCircle2, FileSearch } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface PlanTelemetryCardProps {
  citations: string[];
}

export function PlanTelemetryCard({ citations }: PlanTelemetryCardProps) {
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

      {/* Privacy & LGPD Guarantee */}
      <div className="p-4 rounded-xl border border-brand-teal/30 bg-brand-teal/5 space-y-2">
        <div className="flex items-center gap-2 text-brand-teal font-semibold text-xs sm:text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Privacidade & LGPD Garantidas</span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          Toda a ementa, referências e objetivos gerados permanecem 100% dentro do appliance local da faculdade. Zero vazamento de propriedade intelectual ou dados pedagógicos para nuvens externas.
        </p>
      </div>
    </div>
  );
}
