'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { AdvancedCombobox, type ComboboxItem } from '@/components/ui/advanced-combobox';
import { API_ROUTES } from '@/lib/constants/routes';
import type { Student } from './StudentFormModal';

type StudentWithClass = Student & { class: { id: string; name: string; code: string } | null };

export interface EnrollStudentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  onSuccess: (student: Student) => void;
}

export function EnrollStudentModal({
  open,
  onOpenChange,
  classId,
  className,
  onSuccess,
}: EnrollStudentModalProps) {
  const [candidates, setCandidates] = React.useState<StudentWithClass[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setError(null);
    let cancelled = false;
    (async () => {
      try {
        setFetching(true);
        const res = await fetch(API_ROUTES.ADMIN_STUDENTS);
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          setError(data.error || 'Não foi possível carregar os alunos.');
          return;
        }
        setCandidates((data.students as StudentWithClass[]).filter((s) => s.classId !== classId));
      } catch {
        if (!cancelled) setError('Não foi possível carregar os alunos.');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, classId]);

  const items: ComboboxItem[] = React.useMemo(
    () =>
      candidates.map((s) => ({
        id: s.id,
        title: `${s.name} · ${s.enrollment ?? 'sem matrícula'} · ${s.class ? s.class.name : 'Sem turma'}`,
      })),
    [candidates],
  );

  const selected = candidates.find((s) => s.id === selectedId) ?? null;
  const isEmpty = !fetching && !error && candidates.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedId) {
      setError('Selecione o aluno.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(API_ROUTES.ADMIN_STUDENTS, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId, classId }),
      });
      const data = await res.json();
      if (data.success && data.student) {
        onOpenChange(false);
        onSuccess(data.student);
      } else {
        setError(data.error || 'Erro ao matricular aluno.');
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
      title="Matricular aluno existente"
      description={`Escolha um aluno já cadastrado para matricular em ${className}.`}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {isEmpty ? (
          <p className="text-sm text-slate-500">Todos os alunos já estão nesta turma.</p>
        ) : (
          <AdvancedCombobox
            id="enroll-student-combobox"
            label="Aluno"
            placeholder="Selecione o aluno"
            searchPlaceholder="Buscar por nome ou matrícula..."
            items={items}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            disabled={fetching}
          />
        )}

        {selected?.class && (
          <p className="text-xs rounded-lg border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 p-2.5">
            Será movido de {selected.class.name} para {className}.
          </p>
        )}

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
            disabled={loading || fetching || isEmpty}
            className="bg-brand-teal hover:bg-brand-teal/90 text-white cursor-pointer"
          >
            {loading ? 'Salvando...' : 'Matricular'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
