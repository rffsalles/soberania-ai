'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_ROUTES } from '@/lib/constants/routes';

export interface Student {
  id: string;
  name: string;
  email: string;
  enrollment: string | null;
  classId: string | null;
  createdAt: string;
}

export interface StudentFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  onSuccess: (student: Student) => void;
}

export function StudentFormModal({ open, onOpenChange, classId, onSuccess }: StudentFormModalProps) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [enrollment, setEnrollment] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setEnrollment('');
    setPassword('');
    setError(null);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(API_ROUTES.ADMIN_STUDENTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, enrollment, password, classId }),
      });
      const data = await res.json();
      if (data.success && data.student) {
        onOpenChange(false);
        onSuccess(data.student);
      } else {
        setError(data.error || 'Erro ao cadastrar aluno.');
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
      title="Novo aluno"
      description="Informe os dados do aluno. Ele será matriculado nesta turma."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="student-name">Nome completo</Label>
          <Input
            id="student-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Ana Souza"
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="student-email">E-mail</Label>
          <Input
            id="student-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@soberania.edu.br"
            required
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="student-enrollment">Matrícula</Label>
            <Input
              id="student-enrollment"
              value={enrollment}
              onChange={(e) => setEnrollment(e.target.value)}
              placeholder="ALU001"
              required
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="student-password">Senha inicial</Label>
            <Input
              id="student-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              className="rounded-xl"
            />
          </div>
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
            {loading ? 'Salvando...' : 'Cadastrar aluno'}
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
