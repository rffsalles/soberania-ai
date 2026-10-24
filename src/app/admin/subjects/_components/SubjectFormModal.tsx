'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import {
  AdvancedCombobox,
  AdvancedMultiCombobox,
  type ComboboxItem,
} from '@/components/ui/advanced-combobox';
import { API_ROUTES } from '@/lib/constants/routes';
import type { Teacher } from './TeacherCreateModal';
import type { ClassOption } from '../../classes/_components/ClassFormModal';


export interface OfferingItem {
  id: string;
  discipline: { id: string; code: string; name: string; workloadHours: number };
  class: {
    id: string;
    name: string;
    code: string;
    courseId: string;
    course: { id: string; name: string; code: string };
    academicPeriod: { id: string; name: string; code: string };
  };
  teacherAssignments: { teacher: Teacher }[];
  teachingPlans: { id: string; status: string }[];
}

interface DisciplineLite {
  id: string;
  courseId: string;
  code: string;
  name: string;
  workloadHours: number;
}

const toDisciplineItem = (d: Omit<DisciplineLite, 'courseId'>): ComboboxItem => ({
  id: d.id,
  title: `${d.code} · ${d.name}`,
  subtitle: `${d.workloadHours} h`,
});

interface SubjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSubject: OfferingItem | null;
  teachers: Teacher[];
  classes: ClassOption[];
  selectedTeachers: string[];
  setSelectedTeachers: React.Dispatch<React.SetStateAction<string[]>>;
  selectedClassId: string | null;
  setSelectedClassId: (id: string | null) => void;
  onSuccess: () => void;
  onRequestCreateTeacher: () => void;
  onRequestCreateClass: () => void;
}

export function SubjectFormModal({
  open,
  onOpenChange,
  editingSubject,
  teachers,
  classes,
  selectedTeachers,
  setSelectedTeachers,
  selectedClassId,
  setSelectedClassId,
  onSuccess,
  onRequestCreateTeacher,
  onRequestCreateClass,
}: SubjectFormModalProps) {
  const [disciplineId, setDisciplineId] = React.useState<string | null>(null);
  const [disciplines, setDisciplines] = React.useState<DisciplineLite[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingDisciplines, setLoadingDisciplines] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setError(null);
    if (editingSubject) {
      setSelectedClassId(editingSubject.class.id);
      setDisciplineId(editingSubject.discipline.id);
      setSelectedTeachers(editingSubject.teacherAssignments.map((ta) => ta.teacher.id));
    } else {
      setSelectedClassId(null);
      setDisciplineId(null);
      setSelectedTeachers([]);
    }
  }, [open, editingSubject, setSelectedTeachers, setSelectedClassId]);

  const courseId = classes.find((c) => c.id === selectedClassId)?.courseId ?? null;

  React.useEffect(() => {
    if (!open || editingSubject) return;
    setDisciplineId(null);
    setDisciplines([]);
    setError(null);
    if (!courseId) {
      setLoadingDisciplines(false);
      return;
    }
    let cancelled = false;
    setLoadingDisciplines(true);
    fetch(`${API_ROUTES.ADMIN_DISCIPLINES}?courseId=${encodeURIComponent(courseId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLoadingDisciplines(false);
        if (data.success) setDisciplines(data.disciplines);
        else setError(data.error || 'Não foi possível carregar as disciplinas do curso.');
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingDisciplines(false);
        setError('Não foi possível carregar as disciplinas do curso.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, editingSubject, selectedClassId, courseId]);

  const disciplineItems: ComboboxItem[] = React.useMemo(
    () =>
      editingSubject
        ? [toDisciplineItem(editingSubject.discipline)]
        : disciplines.filter((d) => d.courseId === courseId).map(toDisciplineItem),
    [editingSubject, disciplines, courseId],
  );

  const teacherItems: ComboboxItem[] = React.useMemo(() => {
    return teachers.map((t) => ({
      id: t.id,
      title: t.name,
      subtitle: t.email,
      badge: t.enrollment,
    }));
  }, [teachers]);

  const classItems: ComboboxItem[] = React.useMemo(
    () =>
      classes.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: `${c.course.code} · ${c.academicPeriod.code}`,
        badge: c.code,
      })),
    [classes],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!editingSubject) {
      if (!selectedClassId) return setError('Selecione a turma');
      if (!disciplineId) return setError('Selecione a disciplina');
    }
    try {
      setLoading(true);
      const bodyPayload = editingSubject
        ? { id: editingSubject.id, teacherIds: selectedTeachers }
        : { classId: selectedClassId, disciplineId, teacherIds: selectedTeachers };

      const res = await fetch(API_ROUTES.ADMIN_SUBJECTS, {
        method: editingSubject ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (data.success) {
        onOpenChange(false);
        onSuccess();
      } else {
        setError(data.error || 'Erro ao salvar oferta.');
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
      title={editingSubject ? 'Editar oferta' : 'Nova oferta'}
      description="Escolha a turma, uma disciplina do curso da turma e os professores."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="space-y-1.5">
          <AdvancedCombobox
            id="subject-class-combobox"
            label="Turma"
            placeholder="Selecione a turma"
            searchPlaceholder="Buscar por nome ou código..."
            items={classItems}
            selectedId={selectedClassId}
            onSelect={(id) => setSelectedClassId(id || null)}
            disabled={Boolean(editingSubject)}
            {...(editingSubject ? {} : { addNewLabel: '+ Nova turma...', onAddNewClick: onRequestCreateClass })}
          />
        </div>

        <div className="space-y-1.5">
          <AdvancedCombobox
            id="subject-discipline-combobox"
            label="Disciplina"
            placeholder={selectedClassId ? 'Selecione a disciplina' : 'Escolha a turma primeiro'}
            searchPlaceholder="Buscar por código ou nome..."
            emptyMessage={loadingDisciplines ? 'Carregando disciplinas...' : 'Nenhuma disciplina cadastrada para este curso.'}
            items={disciplineItems}
            selectedId={disciplineId}
            onSelect={(id) => setDisciplineId(id || null)}
            disabled={!selectedClassId || Boolean(editingSubject) || loadingDisciplines}
          />
        </div>

        <div className="space-y-1.5">
          <AdvancedMultiCombobox
            label="Professores"
            placeholder="Selecione um ou mais professores..."
            searchPlaceholder="Buscar por docente, matrícula ou e-mail..."
            items={teacherItems}
            selectedIds={selectedTeachers}
            onSelectionChange={(ids) => setSelectedTeachers(ids)}
            addNewLabel="+ Cadastrar Novo Professor..."
            onAddNewClick={onRequestCreateTeacher}
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
            {loading
              ? 'Salvando...'
              : editingSubject
              ? 'Atualizar oferta'
              : 'Salvar oferta'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
