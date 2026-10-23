'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import {
  AdvancedCombobox,
  AdvancedMultiCombobox,
  type ComboboxItem,
} from '@/components/ui/advanced-combobox';
import { API_ROUTES } from '@/lib/constants/routes';
import type { Teacher } from './TeacherCreateModal';
import type { ClassOption } from '../../classes/_components/ClassFormModal';

export type { ClassOption };

type AcademicLevel = 'HIGHER_EDUCATION' | 'HIGH_SCHOOL' | 'ELEMENTARY';

const NO_CLASS_ID = '__none__';

export interface SubjectItem {
  id: string;
  name: string;
  code: string;
  courseName: string;
  academicLevel: string;
  academicYear: number;
  classId?: string | null;
  class?: { id: string; name: string; code: string } | null;
  teacherAssignments: { teacher: Teacher }[];
}

interface SubjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSubject: SubjectItem | null;
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
}:  SubjectFormModalProps) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [courseName, setCourseName] = React.useState('');
  const [academicLevel, setAcademicLevel] = React.useState<AcademicLevel>('HIGHER_EDUCATION');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (editingSubject) {
      setName(editingSubject.name);
      setCode(editingSubject.code);
      setCourseName(editingSubject.courseName);
      setSelectedClassId(editingSubject.classId ?? null);
      setAcademicLevel(editingSubject.academicLevel as AcademicLevel);
      setSelectedTeachers(editingSubject.teacherAssignments.map((ta) => ta.teacher.id));
    } else {
      setName('');
      setCode('');
      setCourseName('');
      setSelectedClassId(null);
      setAcademicLevel('HIGHER_EDUCATION');
      setSelectedTeachers([]);
    }
  }, [editingSubject, setSelectedTeachers, setSelectedClassId]);

  const teacherItems: ComboboxItem[] = React.useMemo(() => {
    return teachers.map((t) => ({
      id: t.id,
      title: t.name,
      subtitle: t.email,
      badge: t.enrollment,
    }));
  }, [teachers]);

  const classItems: ComboboxItem[] = React.useMemo(
    () => [
      { id: NO_CLASS_ID, title: 'Sem turma', subtitle: 'não aparece para alunos' },
      ...classes.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: `${c.year} · ${c.semester}º semestre`,
        badge: c.code,
      })),
    ],
    [classes],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      const isEdit = Boolean(editingSubject);
      const method = isEdit ? 'PUT' : 'POST';
      const bodyPayload = {
        ...(isEdit && editingSubject ? { id: editingSubject.id } : {}),
        name,
        code,
        courseName,
        academicLevel,
        teacherIds: selectedTeachers,
        // Sem turma a disciplina não gera agendas para alunos; null desvincula.
        classId: selectedClassId,
      };

      const res = await fetch(API_ROUTES.ADMIN_SUBJECTS, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (data.success) {
        onOpenChange(false);
        onSuccess();
      } else {
        setError(data.error || 'Erro ao salvar disciplina.');
      }
    } catch {
      setError('Erro ao salvar disciplina.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editingSubject ? 'Editar Disciplina & Vínculos' : 'Nova Disciplina & Vínculos'}
      description="Gerencie os dados da disciplina e os docentes alocados."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="subject-name">Nome da Disciplina</Label>
          <Input
            id="subject-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Banco de Dados I"
            required
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="subject-code">Código</Label>
            <Input
              id="subject-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex: BD101"
              required
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject-course">Curso</Label>
            <Input
              id="subject-course"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="ex: ADS, Engenharia de Software, Ensino Médio"
              required
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject-academic-level">Nível acadêmico</Label>
          <select
            id="subject-academic-level"
            value={academicLevel}
            onChange={(e) => setAcademicLevel(e.target.value as AcademicLevel)}
            className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 cursor-pointer"
          >
            <option value="HIGHER_EDUCATION">Ensino Superior</option>
            <option value="HIGH_SCHOOL">Ensino Médio</option>
            <option value="ELEMENTARY">Fundamental</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <AdvancedCombobox
            id="subject-class-combobox"
            label="Turma"
            placeholder="Sem turma (não aparece para alunos)"
            searchPlaceholder="Buscar por nome ou código..."
            items={classItems}
            selectedId={selectedClassId ?? NO_CLASS_ID}
            onSelect={(id) => setSelectedClassId(id === NO_CLASS_ID ? null : id)}
            addNewLabel="+ Nova turma..."
            onAddNewClick={onRequestCreateClass}
          />
          <p className="text-[11px] text-slate-500">Ano letivo e semestre vêm da turma selecionada.</p>
        </div>

        <div className="space-y-1.5">
          <AdvancedMultiCombobox
            label="Professores Alocados (N:N)"
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
              ? 'Atualizar disciplina'
              : 'Salvar disciplina'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
