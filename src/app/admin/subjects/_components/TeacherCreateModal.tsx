'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface Teacher {
  id: string;
  name: string;
  email: string;
  enrollment: string;
}

interface TeacherCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (teacher: Teacher) => void;
}

export function TeacherCreateModal({
  open,
  onOpenChange,
  onSuccess,
}: TeacherCreateModalProps) {
  const [teacherName, setTeacherName] = React.useState('');
  const [teacherEmail, setTeacherEmail] = React.useState('');
  const [teacherEnrollment, setTeacherEnrollment] = React.useState('');
  const [teacherPassword, setTeacherPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (teacherPassword.length < 8) {
      setPasswordError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    setPasswordError('');
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teacherName,
          email: teacherEmail,
          enrollment: teacherEnrollment,
          password: teacherPassword,
        }),
      });
      const data = await res.json();
      if (data.success && data.teacher) {
        setTeacherName('');
        setTeacherEmail('');
        setTeacherEnrollment('');
        setTeacherPassword('');
        onOpenChange(false);
        onSuccess(data.teacher);
      } else {
        alert(data.error || 'Erro ao cadastrar professor.');
      }
    } catch {
      alert('Erro ao conectar com servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Cadastrar Docente / Professor"
      description="Informe os dados para criação e alocação do novo docente."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label>Nome Completo</Label>
          <Input
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="ex: Prof. Carlos Eduardo"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label>E-mail Institucional</Label>
          <Input
            type="email"
            value={teacherEmail}
            onChange={(e) => setTeacherEmail(e.target.value)}
            placeholder="carlos@soberania.edu.br"
            required
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Matrícula</Label>
            <Input
              value={teacherEnrollment}
              onChange={(e) => setTeacherEnrollment(e.target.value)}
              placeholder="PROF002"
              required
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Senha Inicial</Label>
            <Input
              type="password"
              value={teacherPassword}
              onChange={(e) => setTeacherPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              className="rounded-xl"
            />
            {passwordError && (
              <p role="alert" className="text-xs text-red-600">
                {passwordError}
              </p>
            )}
          </div>
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
            {loading ? 'Cadastrando...' : 'Cadastrar Professor'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
