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
import type { Teacher } from './TeacherCreateModal';

export interface SubjectItem {
  id: string;
  name: string;
  code: string;
  courseName: string;
  academicLevel: string;
  academicYear: number;
  teacherAssignments: { teacher: Teacher }[];
}

interface SubjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSubject: SubjectItem | null;
  teachers: Teacher[];
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
  selectedTeachers,
  setSelectedTeachers,
  onSuccess,
  onRequestCreateTeacher,
}: SubjectFormModalProps) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [courseName, setCourseName] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (editingSubject) {
      setName(editingSubject.name);
      setCode(editingSubject.code);
      setCourseName(editingSubject.courseName);
      setSelectedTeachers(editingSubject.teacherAssignments.map((ta) => ta.teacher.id));
    } else {
      setName('');
      setCode('');
      setCourseName('');
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
        academicLevel: 'HIGHER_EDUCATION',
        academicYear: 2026,
        teacherIds: selectedTeachers,
      };

      const res = await fetch('/api/v1/admin/subjects', {
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
