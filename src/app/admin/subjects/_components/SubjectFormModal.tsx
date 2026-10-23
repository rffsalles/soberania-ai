'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import {
  AdvancedMultiCombobox,
  type ComboboxItem,
} from '@/components/ui/advanced-combobox';
import { API_ROUTES } from '@/lib/constants/routes';
import type { Teacher } from './TeacherCreateModal';

export interface ClassOption {
  id: string;
  name: string;
  code: string;
  semester: number;
  year: number;
}

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
  onSuccess: () => void;
  onRequestCreateTeacher: () => void;
}

export function SubjectFormModal({
  open,
  onOpenChange,
  editingSubject,
  teachers,
  classes,
  selectedTeachers,
  setSelectedTeachers,
  onSuccess,
  onRequestCreateTeacher,
}: SubjectFormModalProps) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [courseName, setCourseName] = React.useState('');
  const [classId, setClassId] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (editingSubject) {
      setName(editingSubject.name);
      setCode(editingSubject.code);
      setCourseName(editingSubject.courseName);
      setClassId(editingSubject.classId ?? '');
      setSelectedTeachers(editingSubject.teacherAssignments.map((ta) => ta.teacher.id));
    } else {
      setName('');
      setCode('');
      setCourseName('');
      setClassId('');
      setSelectedTeachers([]);
    }
  }, [editingSubject, setSelectedTeachers]);

  const teacherItems: ComboboxItem[] = React.useMemo(() => {
    return teachers.map((t) => ({
      id: t.id,
      title: t.name,
      subtitle: t.email,
      badge: t.enrollment,
    }));
  }, [teachers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const isEdit = Boolean(editingSubject);
      const method = isEdit ? 'PUT' : 'POST';
      const bodyPayload = {
        ...(isEdit && editingSubject ? { id: editingSubject.id } : {}),
        name,
        code,
        courseName,
        // Editar preserva o que está salvo; criar usa o ano corrente.
        academicLevel: editingSubject?.academicLevel ?? 'HIGHER_EDUCATION',
        academicYear: editingSubject?.academicYear ?? new Date().getFullYear(),
        teacherIds: selectedTeachers,
        // Sem turma a disciplina não gera agendas para alunos; null desvincula.
        classId: classId || null,
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
        alert(data.error || 'Erro ao salvar disciplina.');
      }
    } catch {
      alert('Erro ao salvar disciplina.');
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
          <Label>Nome da Disciplina</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Banco de Dados I"
            required
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Código</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex: BD101"
              required
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Curso / Ano</Label>
            <Input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="ex: ADS / 3º EM"
              required
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject-class-select">Turma</Label>
          <select
            id="subject-class-select"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 cursor-pointer"
          >
            <option value="">Sem turma (não aparece para alunos)</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
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
              ? 'Atualizar Vínculo'
              : 'Salvar Vínculo'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
