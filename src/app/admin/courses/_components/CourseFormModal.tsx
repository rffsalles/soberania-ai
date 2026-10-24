'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_ROUTES } from '@/lib/constants/routes';

export type AcademicLevelValue = 'HIGHER_EDUCATION' | 'HIGH_SCHOOL' | 'ELEMENTARY';

export const ACADEMIC_LEVEL_LABELS: Record<AcademicLevelValue, string> = {
  HIGHER_EDUCATION: 'Ensino Superior',
  HIGH_SCHOOL: 'Ensino Médio',
  ELEMENTARY: 'Ensino Fundamental',
};

export interface CourseOption {
  id: string;
  name: string;
  code: string;
  academicLevel: AcademicLevelValue;
  _count?: { disciplines: number; classes: number };
}

export interface CourseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCourse: CourseOption | null;
  onSuccess: () => void;
}

export function CourseFormModal({
  open,
  onOpenChange,
  editingCourse,
  onSuccess,
}: CourseFormModalProps) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [academicLevel, setAcademicLevel] = React.useState<AcademicLevelValue>('HIGHER_EDUCATION');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingCourse) {
      setName(editingCourse.name);
      setCode(editingCourse.code);
      setAcademicLevel(editingCourse.academicLevel);
    } else {
      setName('');
      setCode('');
      setAcademicLevel('HIGHER_EDUCATION');
    }
  }, [open, editingCourse]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      const res = await fetch(API_ROUTES.ADMIN_COURSES, {
        method: editingCourse ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingCourse ? { id: editingCourse.id } : {}),
          name,
          code,
          academicLevel,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onOpenChange(false);
        onSuccess();
      } else {
        setError(data.error || 'Erro ao salvar curso.');
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
      title={editingCourse ? 'Editar curso' : 'Novo curso'}
      description="Informe os dados do curso."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="course-name">Nome do curso</Label>
          <Input
            id="course-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Análise e Desenvolvimento de Sistemas"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="course-code">Código</Label>
          <Input
            id="course-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ADS"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="course-academic-level">Nível acadêmico</Label>
          <select
            id="course-academic-level"
            value={academicLevel}
            onChange={(e) => setAcademicLevel(e.target.value as AcademicLevelValue)}
            className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 cursor-pointer"
          >
            {(Object.keys(ACADEMIC_LEVEL_LABELS) as AcademicLevelValue[]).map((level) => (
              <option key={level} value={level}>
                {ACADEMIC_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
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
            {loading ? 'Salvando...' : editingCourse ? 'Atualizar curso' : 'Salvar curso'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
