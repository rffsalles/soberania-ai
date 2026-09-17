'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, GraduationCap } from 'lucide-react';
import type { SubjectOption } from '../types';

interface SubjectCreateInlineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (subject: SubjectOption) => void;
}

export function SubjectCreateInlineModal({
  open,
  onOpenChange,
  onCreated,
}: SubjectCreateInlineModalProps) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [courseName, setCourseName] = React.useState('');
  const [academicLevel, setAcademicLevel] = React.useState('HIGHER_EDUCATION');
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !courseName.trim()) {
      setError('Por favor, preencha o nome, código e curso da disciplina.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch('/api/v1/admin/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          courseName: courseName.trim(),
          academicLevel,
          description: description.trim(),
          academicYear: 2026,
        }),
      });

      const data = await res.json();
      if (data.success && data.subject) {
        onCreated({
          id: data.subject.id,
          name: data.subject.name,
          code: data.subject.code,
          courseName: data.subject.courseName,
          academicLevel: data.subject.academicLevel,
          academicYear: data.subject.academicYear,
        });
        onOpenChange(false);
        // Reset
        setName('');
        setCode('');
        setCourseName('');
        setDescription('');
      } else {
        setError(data.error || 'Erro ao cadastrar disciplina.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha na comunicação com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Cadastrar Nova Disciplina"
      description="Cadastre a disciplina no acervo curricular sem sair da elaboração do plano."
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error && (
          <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="subject-name-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Nome da Disciplina *
          </label>
          <Input
            id="subject-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Inteligência Artificial e RAG"
            className="rounded-xl text-xs sm:text-sm"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="subject-code-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Código / Sigla *
            </label>
            <Input
              id="subject-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: IA402"
              className="rounded-xl text-xs sm:text-sm font-mono"
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="subject-course-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Curso / Matriz *
            </label>
            <Input
              id="subject-course-input"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Ex: Engenharia de Software"
              className="rounded-xl text-xs sm:text-sm"
              disabled={isSubmitting}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="subject-level-select" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Nível Acadêmico
          </label>
          <select
            id="subject-level-select"
            value={academicLevel}
            onChange={(e) => setAcademicLevel(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-medium cursor-pointer"
            disabled={isSubmitting}
          >
            <option value="HIGHER_EDUCATION">Ensino Superior (Graduação / Pós)</option>
            <option value="HIGH_SCHOOL">Ensino Médio / Técnico</option>
            <option value="ELEMENTARY">Ensino Fundamental</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="subject-desc-input" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Descrição Curricular / Ementa Preliminar
          </label>
          <Textarea
            id="subject-desc-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve escopo ou objetivos curriculares básicos..."
            rows={2}
            className="rounded-xl text-xs sm:text-sm"
            disabled={isSubmitting}
          />
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
            <span>Cadastrar e Vincular</span>
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
