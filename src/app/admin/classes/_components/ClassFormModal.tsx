'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_ROUTES } from '@/lib/constants/routes';

export interface ClassOption {
  id: string;
  name: string;
  code: string;
  semester: number;
  year: number;
  _count?: { students: number; subjects: number };
}

export interface ClassFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClass: ClassOption | null;
  onSuccess: (klass: ClassOption) => void;
}

const SEMESTERS = [1, 2, 3, 4];

export function ClassFormModal({
  open,
  onOpenChange,
  editingClass,
  onSuccess,
}: ClassFormModalProps) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [year, setYear] = React.useState(String(new Date().getFullYear()));
  const [semester, setSemester] = React.useState('1');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingClass) {
      setName(editingClass.name);
      setCode(editingClass.code);
      setYear(String(editingClass.year));
      setSemester(String(editingClass.semester));
    } else {
      setName('');
      setCode('');
      setYear(String(new Date().getFullYear()));
      setSemester('1');
    }
  }, [open, editingClass]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      const res = await fetch(API_ROUTES.ADMIN_CLASSES, {
        method: editingClass ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingClass ? { id: editingClass.id } : {}),
          name,
          code,
          year: Number(year),
          semester: Number(semester),
        }),
      });
      const data = await res.json();
      if (data.success && data.class) {
        onOpenChange(false);
        onSuccess(data.class);
      } else {
        setError(data.error || 'Erro ao salvar turma.');
      }
    } catch {
      setError('Erro ao conectar com servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editingClass ? 'Editar turma' : 'Nova turma'}
      description="Informe os dados da turma."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="class-name">Nome da turma</Label>
          <Input
            id="class-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: 3º Semestre · ADS"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="class-code">Código</Label>
          <Input
            id="class-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ADS-2026-3A"
            required
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="class-year">Ano letivo</Label>
            <Input
              id="class-year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-semester">Semestre</Label>
            <select
              id="class-semester"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 cursor-pointer"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={String(s)}>
                  {s}º semestre
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="bg-brand-teal hover:bg-brand-teal/90 text-white cursor-pointer"
          >
            {loading ? 'Salvando...' : editingClass ? 'Atualizar turma' : 'Salvar turma'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
