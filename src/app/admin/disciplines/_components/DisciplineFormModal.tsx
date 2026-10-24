'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_ROUTES } from '@/lib/constants/routes';
import type { CourseOption } from '@/app/admin/courses/_components/CourseFormModal';

export interface DisciplineOption {
  id: string;
  courseId: string;
  code: string;
  name: string;
  description: string | null;
  workloadHours: number;
  course: { id: string; name: string; code: string };
  _count?: { offerings: number };
}

export interface DisciplineFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingDiscipline: DisciplineOption | null;
  courses: CourseOption[];
  defaultCourseId: string | null;
  onSuccess: () => void;
}

export function DisciplineFormModal({
  open,
  onOpenChange,
  editingDiscipline,
  courses,
  defaultCourseId,
  onSuccess,
}: DisciplineFormModalProps) {
  const [courseId, setCourseId] = React.useState('');
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [workloadHours, setWorkloadHours] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingDiscipline) {
      setCourseId(editingDiscipline.courseId);
      setCode(editingDiscipline.code);
      setName(editingDiscipline.name);
      setWorkloadHours(String(editingDiscipline.workloadHours));
      setDescription(editingDiscipline.description ?? '');
    } else {
      setCourseId(defaultCourseId ?? '');
      setCode('');
      setName('');
      setWorkloadHours('');
      setDescription('');
    }
  }, [open, editingDiscipline, defaultCourseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!editingDiscipline && !courseId) {
      setError('Selecione o curso');
      return;
    }
    try {
      setLoading(true);
      const common = {
        code,
        name,
        workloadHours: Number(workloadHours),
        description: description.trim(),
      };
      const res = await fetch(API_ROUTES.ADMIN_DISCIPLINES, {
        method: editingDiscipline ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingDiscipline ? { id: editingDiscipline.id, ...common } : { courseId, ...common }
        ),
      });
      const data = await res.json();
      if (data.success) {
        onOpenChange(false);
        onSuccess();
      } else {
        setError(data.error || 'Erro ao salvar disciplina.');
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
      title={editingDiscipline ? 'Editar disciplina' : 'Nova disciplina'}
      description="Disciplina da matriz curricular do curso."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="discipline-course">Curso</Label>
          <select
            id="discipline-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            disabled={!!editingDiscipline}
            className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Selecione o curso</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.code} · ${c.name}`}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="discipline-code">Código</Label>
          <Input
            id="discipline-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="BD101"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="discipline-name">Nome da disciplina</Label>
          <Input
            id="discipline-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Banco de Dados I"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="discipline-workload">Carga horária (h)</Label>
          <Input
            id="discipline-workload"
            type="number"
            min={1}
            max={1000}
            value={workloadHours}
            onChange={(e) => setWorkloadHours(e.target.value)}
            placeholder="80"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="discipline-description">Descrição (opcional)</Label>
          <Textarea
            id="discipline-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-xl"
          />
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
            {loading ? 'Salvando...' : editingDiscipline ? 'Atualizar disciplina' : 'Salvar disciplina'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
