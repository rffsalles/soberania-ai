'use client';

import * as React from 'react';
import { ListOrdered, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { usePlanChapters } from '@/components/teaching/use-plan-chapters';
import { formatChapterShortList } from '@/components/teaching/chapter-combobox-item';
import type { PlanUnit } from '@/lib/validators/teaching-plan.validator';

interface PlanUnitsCardProps {
  planId: string;
  units: PlanUnit[];
  onChange: (units: PlanUnit[]) => void;
}

export function PlanUnitsCard({ planId, units, onChange }: PlanUnitsCardProps) {
  const { books } = usePlanChapters(planId);
  const orderById = React.useMemo(
    () => new Map(books.flatMap((b) => b.chapters.map((c) => [c.id, c.order] as const))),
    [books],
  );

  const update = (index: number, patch: Partial<PlanUnit>) =>
    onChange(units.map((u, i) => (i === index ? { ...u, ...patch } : u)));

  const addUnit = () =>
    onChange([...units, { unitNumber: units.length + 1, title: '', topics: [], chapterIds: [] }]);
  const removeUnit = (index: number) =>
    onChange(units.filter((_, i) => i !== index).map((u, i) => ({ ...u, unitNumber: i + 1 })));

  return (
    <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800 shadow-soft-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-heading flex items-center gap-2 text-slate-900 dark:text-white">
          <ListOrdered className="h-4 w-4 text-brand-teal" />
          <span>Unidades do plano</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {units.length === 0 ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Nenhuma unidade cadastrada. Distribua os capítulos no cronograma e use &quot;Gerar unidades do plano&quot;.
          </p>
        ) : (
          units.map((unit, index) => {
            const orders = (unit.chapterIds ?? []).flatMap((id) => {
              const order = orderById.get(id);
              return order === undefined ? [] : [order];
            });
            return (
              <div
                key={unit.unitNumber}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px] shrink-0">
                    Unidade {unit.unitNumber}
                  </Badge>
                  <Input
                    aria-label={`Título da unidade ${unit.unitNumber}`}
                    value={unit.title}
                    maxLength={200}
                    onChange={(e) => update(index, { title: e.target.value })}
                  />
                  <Badge variant="outline" className="text-[11px] shrink-0 text-brand-teal border-brand-teal/30">
                    {formatChapterShortList(orders)}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover unidade ${unit.unitNumber}`}
                    onClick={() => removeUnit(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  aria-label={`Tópicos da unidade ${unit.unitNumber}`}
                  value={unit.topics.join('\n')}
                  onChange={(e) => update(index, { topics: e.target.value.split('\n') })}
                  rows={4}
                />
              </div>
            );
          })
        )}
        <Button type="button" variant="outline" size="sm" onClick={addUnit}>
          Adicionar unidade
        </Button>
      </CardContent>
    </Card>
  );
}
