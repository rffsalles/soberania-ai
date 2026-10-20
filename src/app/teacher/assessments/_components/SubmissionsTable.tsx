'use client';

import * as React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSubmissions } from '@/components/assessments/use-assessments';

export function SubmissionsTable({ assessmentId }: { assessmentId: string }) {
  const { submissions, isLoading, error } = useSubmissions(assessmentId);

  if (isLoading) return <p className="text-sm text-slate-500">Carregando submissões...</p>;
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (submissions.length === 0) return <p className="text-sm text-slate-500">Nenhuma submissão recebida ainda.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Aluno</TableHead>
          <TableHead>Nota</TableHead>
          <TableHead>Enviada em</TableHead>
          <TableHead>Interações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {submissions.map((s) => {
          const blocked = s.interactions.filter((i) => i.guardrailBlocked).length;
          return (
            <TableRow key={`${s.agendaId}-${s.studentId}`}>
              <TableCell className="font-medium">{s.studentName}</TableCell>
              <TableCell>
                {s.score.toFixed(1)} / {s.maxScore.toFixed(1)}
              </TableCell>
              <TableCell>{new Date(s.submittedAt).toLocaleString('pt-BR')}</TableCell>
              <TableCell>
                <details>
                  <summary className="cursor-pointer text-xs text-brand-teal">
                    {s.interactions.length} interação(ões)
                    {blocked > 0 && (
                      <Badge className="ml-2 gap-1 bg-red-500/10 text-red-600">
                        <ShieldAlert className="h-3 w-3" />
                        {blocked} bloqueada(s)
                      </Badge>
                    )}
                  </summary>
                  <ul className="mt-2 space-y-2 text-xs">
                    {s.interactions.map((i, idx) => (
                      <li key={idx} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                        <p className="font-semibold">{i.questionText}</p>
                        <p className="text-slate-500">
                          {i.guardrailBlocked ? 'Resposta bloqueada pelo guardrail.' : i.responseText}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
