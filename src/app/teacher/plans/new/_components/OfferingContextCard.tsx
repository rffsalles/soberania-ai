import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { OfferingOption } from '../types';

export function OfferingContextCard({ offering }: { offering: OfferingOption | null }) {
  if (!offering) return null;
  const { class: turma, discipline } = offering;
  const rows: Array<[string, string]> = [
    ['Curso', `${turma.course.name} (${turma.course.code})`],
    ['Turma', turma.name],
    ['Período letivo', turma.academicPeriod.name],
    ['Carga horária da matriz', `${discipline.workloadHours}h`],
  ];
  return (
    <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-heading text-brand-blue dark:text-blue-400">Contexto da oferta</CardTitle>
        <p className="text-[11px] text-slate-500">Definido pela coordenação. Somente leitura.</p>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-xs">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
