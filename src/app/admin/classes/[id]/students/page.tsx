'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProviderBadge } from '@/components/layout/provider-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ClassOption } from '../../_components/ClassFormModal';
import { StudentFormModal } from './_components/StudentFormModal';
import { EnrollStudentModal } from './_components/EnrollStudentModal';
import { API_ROUTES, ROUTES } from '@/lib/constants/routes';

export interface ClassStudent {
  id: string;
  name: string;
  email: string;
  enrollment: string | null;
  classId: string | null;
  createdAt: string;
}

export default function ClassStudentsPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;

  const [klass, setKlass] = React.useState<ClassOption | null>(null);
  const [students, setStudents] = React.useState<ClassStudent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isEnrollOpen, setIsEnrollOpen] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [classesRes, studentsRes] = await Promise.all([
        fetch(API_ROUTES.ADMIN_CLASSES),
        fetch(`${API_ROUTES.ADMIN_STUDENTS}?classId=${classId}`),
      ]);
      const [classesData, studentsData] = await Promise.all([classesRes.json(), studentsRes.json()]);
      if (!classesData.success || !studentsData.success) {
        throw new Error(classesData.error || studentsData.error);
      }
      const found = (classesData.classes as ClassOption[]).find((c) => c.id === classId);
      if (!found) {
        setKlass(null);
        setLoadError('Turma não encontrada.');
        return;
      }
      setKlass(found);
      setStudents(studentsData.students);
    } catch {
      setLoadError('Não foi possível carregar os alunos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRemove = async (student: ClassStudent) => {
    if (!window.confirm(`Remover ${student.name} da turma?`)) return;
    setActionError(null);
    try {
      const res = await fetch(API_ROUTES.ADMIN_STUDENTS, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id, classId: null }),
      });
      const data = await res.json();
      if (!data.success) {
        setActionError(data.error || 'Erro ao remover aluno da turma.');
        return;
      }
      await fetchData();
    } catch {
      setActionError('Erro ao conectar com servidor.');
    }
  };

  const term = search.toLowerCase();
  const filtered = students.filter(
    (s) =>
      s.name.toLowerCase().includes(term) ||
      s.email.toLowerCase().includes(term) ||
      (s.enrollment ?? '').toLowerCase().includes(term)
  );

  return (
    <div className="p-6 mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <Link
            href={ROUTES.ADMIN_CLASSES}
            className="text-xs text-brand-teal hover:text-brand-teal/80"
          >
            ← Turmas
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Turmas • Alunos
            </Badge>
            <ProviderBadge />
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            {klass ? klass.name : 'Alunos da turma'}
          </h1>
          {klass && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {klass.code} · {klass.course.name}
            </p>
          )}
        </div>

        {klass && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setIsEnrollOpen(true)}
              className="cursor-pointer rounded-xl"
            >
              Matricular aluno existente
            </Button>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer rounded-xl"
            >
              + Novo aluno
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou matrícula..."
            className="pl-9 rounded-xl"
          />
        </div>
        {!loading && !loadError && (
          <span className="text-sm text-slate-500">
            {students.length} {students.length === 1 ? 'aluno' : 'alunos'}
          </span>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}

      <div className="glass rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80">
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <div role="alert" className="flex flex-col items-center gap-2 text-sm text-red-600">
                    <span>{loadError}</span>
                    <Button variant="outline" size="sm" onClick={fetchData} className="cursor-pointer">
                      Tentar novamente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                  Carregando alunos...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                  Nenhum aluno matriculado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((student) => (
                <TableRow key={student.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    {student.name}
                  </TableCell>
                  <TableCell className="text-sm">{student.email}</TableCell>
                  <TableCell className="text-xs text-brand-teal font-mono">
                    {student.enrollment ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(student)}
                      className="text-xs text-red-600 hover:text-red-700 cursor-pointer"
                    >
                      Remover da turma
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {klass && (
        <>
          <StudentFormModal
            open={isCreateOpen}
            onOpenChange={setIsCreateOpen}
            classId={klass.id}
            onSuccess={() => fetchData()}
          />
          <EnrollStudentModal
            open={isEnrollOpen}
            onOpenChange={setIsEnrollOpen}
            classId={klass.id}
            className={klass.name}
            onSuccess={() => fetchData()}
          />
        </>
      )}
    </div>
  );
}
