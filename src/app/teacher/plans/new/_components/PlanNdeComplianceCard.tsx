'use client';

import * as React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NDE_COMPLIANCE_STATUS } from '@/lib/constants/teaching';
import type { NdeComplianceData } from '../types';

interface PlanNdeComplianceCardProps {
  data: NdeComplianceData;
  onChange: (newData: NdeComplianceData) => void;
}

export function PlanNdeComplianceCard({ data, onChange }: PlanNdeComplianceCardProps) {
  const handleFieldChange = <K extends keyof NdeComplianceData>(
    field: K,
    value: NdeComplianceData[K]
  ) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  const isHoursSumValid = data.theoryHours + data.practiceHours === data.totalHours;

  return (
    <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-heading flex items-center gap-2 text-slate-900 dark:text-white">
          <Clock className="h-4 w-4 text-brand-teal" />
          <span>Conformidade NDE / MEC</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        <div className="space-y-1">
          <label htmlFor="total-hours-input" className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block">
            Carga Horária Total (horas) *
          </label>
          <Input
            id="total-hours-input"
            type="number"
            min={1}
            value={data.totalHours}
            onChange={(e) => handleFieldChange('totalHours', Number(e.target.value) || 0)}
            className="h-8 text-xs rounded-lg font-mono bg-white dark:bg-slate-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor="theory-hours-input" className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block">
              Teoria (h)
            </label>
            <Input
              id="theory-hours-input"
              type="number"
              min={0}
              value={data.theoryHours}
              onChange={(e) => handleFieldChange('theoryHours', Number(e.target.value) || 0)}
              className="h-8 text-xs rounded-lg font-mono bg-white dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="practice-hours-input" className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block">
              Prática / Lab (h)
            </label>
            <Input
              id="practice-hours-input"
              type="number"
              min={0}
              value={data.practiceHours}
              onChange={(e) => handleFieldChange('practiceHours', Number(e.target.value) || 0)}
              className="h-8 text-xs rounded-lg font-mono bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="compliance-status-select" className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block">
            Status de Parecer NDE / DCNs
          </label>
          <select
            id="compliance-status-select"
            value={data.ndeComplianceStatus}
            onChange={(e) => handleFieldChange('ndeComplianceStatus', e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 font-medium cursor-pointer text-slate-900 dark:text-white"
          >
            {Object.values(NDE_COMPLIANCE_STATUS).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {!isHoursSumValid && (
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Atenção: Teoria ({data.theoryHours}h) + Prática ({data.practiceHours}h) ≠ Total ({data.totalHours}h).
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

