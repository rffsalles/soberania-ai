'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Calendar } from 'lucide-react';
import { API_ROUTES } from '@/lib/constants/routes';

export interface AcademicPeriodOption {
  id: string;
  name: string;
  code: string;
  year: number;
  semester?: number | null;
  type?: string;
}

interface PeriodCreateInlineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (period: AcademicPeriodOption) => void;
}

export function PeriodCreateInlineModal({
  open,
  onOpenChange,
  onCreated,
}: PeriodCreateInlineModalProps) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [year, setYear] = React.useState('2026');
  const [type, setType] = React.useState<'SEMESTER' | 'ANNUAL' | 'TERM' | 'INTENSIVE'>('SEMESTER');
  const [semester, setSemester] = React.useState('1');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setName('');
    setCode('');
    setType('SEMESTER');
    setSemester('1');
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      setError('Por favor, informe o nome e o código do período letivo.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch(API_ROUTES.ACADEMIC_PERIODS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          year: Number(year) || 2026,
          type,
          semester: type === 'ANNUAL' ? null : Number(semester) || 1,
        }),
      });

      const data = await res.json();
      if (data.success && data.period) {
        onCreated({
          id: data.period.id,
          name: data.period.name,
          code: data.period.code,
          year: data.period.year,
          semester: data.period.semester,
          type: data.period.type,
        });
        onOpenChange(false);
        // Reset
        setName('');
        setCode('');
        setYear('2026');
      } else {
        setError(data.error || 'Erro ao cadastrar período letivo.');
      }
    } catch {
      setError('Erro ao conectar com servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Cadastrar Novo Período Letivo"
      description="Cadastre um período acadêmico ou semestre para vincular aos planos de ensino."
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error && (
          <div role="alert" className="p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="period-name-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Nome do Período *
          </label>
          <Input
            id="period-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: 2º Semestre / 2026 (2026.2)"
            className="rounded-xl text-xs sm:text-sm"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="period-code-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Código / Sigla *
            </label>
            <Input
              id="period-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: 2026.2 ou 2026.ANUAL"
              className="rounded-xl text-xs sm:text-sm font-mono"
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="period-year-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Ano Letivo *
            </label>
            <Input
              id="period-year-input"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2026"
              className="rounded-xl text-xs sm:text-sm font-mono"
              disabled={isSubmitting}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="period-type-select" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Regime / Tipo
            </label>
            <select
              id="period-type-select"
              value={type}
              onChange={(e) => setType(e.target.value as 'SEMESTER' | 'ANNUAL' | 'TERM' | 'INTENSIVE')}
              className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-medium cursor-pointer"
              disabled={isSubmitting}
            >
              <option value="SEMESTER">Semestral</option>
              <option value="ANNUAL">Anual</option>
              <option value="TERM">Trimestral / Bimestral</option>
              <option value="INTENSIVE">Intensivo / Férias</option>
            </select>
          </div>

          {type !== 'ANNUAL' && (
            <div className="space-y-1.5">
              <label htmlFor="period-semester-select" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Semestre / Módulo
              </label>
              <select
                id="period-semester-select"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-medium cursor-pointer"
                disabled={isSubmitting}
              >
                <option value="1">1º Semestre</option>
                <option value="2">2º Semestre</option>
                <option value="3">3º Período</option>
                <option value="4">4º Período</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-xl text-xs cursor-pointer"
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 rounded-xl text-xs cursor-pointer shadow-soft-sm"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>Cadastrar e Selecionar</span>
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
