'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdvancedCombobox, type ComboboxItem } from '@/components/ui/advanced-combobox';
import { API_ROUTES } from '@/lib/constants/routes';
import { PeriodCreateInlineModal, type AcademicPeriodOption } from './PeriodCreateInlineModal';

export interface ClassOption {
  id: string;
  name: string;
  code: string;
  semester: number;
  courseId: string;
  academicPeriodId: string;
  course: { id: string; name: string; code: string; academicLevel: string };
  academicPeriod: { id: string; name: string; code: string; year: number };
  _count?: { students: number; subjects: number };
}

export interface ClassFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClass: ClassOption | null;
  onSuccess: (klass: ClassOption) => void;
}

type CourseChoice = { id: string; name: string; code: string };

export function ClassFormModal({
  open,
  onOpenChange,
  editingClass,
  onSuccess,
}: ClassFormModalProps) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [courseId, setCourseId] = React.useState('');
  const [academicPeriodId, setAcademicPeriodId] = React.useState<string | null>(null);
  const [semester, setSemester] = React.useState('1');
  const [courses, setCourses] = React.useState<CourseChoice[]>([]);
  const [periods, setPeriods] = React.useState<AcademicPeriodOption[]>([]);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingClass) {
      setName(editingClass.name);
      setCode(editingClass.code);
      setCourseId(editingClass.courseId);
      setAcademicPeriodId(editingClass.academicPeriodId);
      setSemester(String(editingClass.semester));
    } else {
      setName('');
      setCode('');
      setCourseId('');
      setAcademicPeriodId(null);
      setSemester('1');
    }
  }, [open, editingClass]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [coursesRes, periodsRes] = await Promise.all([
          fetch(API_ROUTES.ADMIN_COURSES),
          fetch(API_ROUTES.ACADEMIC_PERIODS),
        ]);
        const [coursesData, periodsData] = await Promise.all([coursesRes.json(), periodsRes.json()]);
        if (cancelled) return;
        if (!coursesData.success || !periodsData.success) {
          setError('Não foi possível carregar cursos e períodos.');
          return;
        }
        setCourses(coursesData.courses);
        setPeriods((prev) => {
          const fetched: AcademicPeriodOption[] = periodsData.periods;
          const extra = prev.filter((p) => !fetched.some((f) => f.id === p.id));
          return [...fetched, ...extra];
        });
      } catch {
        if (!cancelled) setError('Não foi possível carregar cursos e períodos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const periodItems: ComboboxItem[] = React.useMemo(
    () => periods.map((p) => ({ id: p.id, title: p.name })),
    [periods],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!courseId) {
      setError('Selecione o curso');
      return;
    }
    if (!academicPeriodId) {
      setError('Selecione o período letivo');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(API_ROUTES.ADMIN_CLASSES, {
        method: editingClass ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingClass ? { id: editingClass.id } : {}),
          name,
          code,
          courseId,
          academicPeriodId,
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
    <>
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

          <div className="space-y-1.5">
            <Label htmlFor="class-course">Curso</Label>
            <select
              id="class-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 cursor-pointer"
            >
              <option value="">Selecione o curso</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <AdvancedCombobox
              id="class-period-combobox"
              label="Período letivo"
              placeholder="Selecione o período letivo"
              searchPlaceholder="Buscar por nome ou código..."
              items={periodItems}
              selectedId={academicPeriodId}
              onSelect={(id) => setAcademicPeriodId(id)}
              addNewLabel="Cadastrar novo período..."
              onAddNewClick={() => setIsPeriodModalOpen(true)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="class-semester">Posição na matriz</Label>
            <Input
              id="class-semester"
              type="number"
              min={1}
              max={12}
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              required
              className="rounded-xl"
            />
            <p className="text-[11px] text-slate-500">Ex.: 3 para 3º semestre ou 3º ano</p>
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

      <PeriodCreateInlineModal
        open={isPeriodModalOpen}
        onOpenChange={setIsPeriodModalOpen}
        onCreated={(p) => {
          setPeriods((prev) => [...prev.filter((x) => x.id !== p.id), p]);
          setAcademicPeriodId(p.id);
        }}
      />
    </>
  );
}
