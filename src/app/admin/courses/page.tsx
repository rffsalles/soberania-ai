'use client';

import * as React from 'react';
import { Plus, Search } from 'lucide-react';
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
import {
  CourseFormModal,
  ACADEMIC_LEVEL_LABELS,
  type CourseOption,
} from './_components/CourseFormModal';
import { API_ROUTES } from '@/lib/constants/routes';

export default function AdminCoursesPage() {
  const [courses, setCourses] = React.useState<CourseOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingCourse, setEditingCourse] = React.useState<CourseOption | null>(null);

  const fetchCourses = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(API_ROUTES.ADMIN_COURSES);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      setCourses(data.courses);
    } catch {
      setLoadError('Não foi possível carregar os cursos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleOpenCreateModal = () => {
    setEditingCourse(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (course: CourseOption) => {
    setEditingCourse(course);
    setIsModalOpen(true);
  };

  const term = search.toLowerCase();
  const filteredCourses = courses.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      c.code.toLowerCase().includes(term)
  );

  return (
    <div className="p-6 mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 0 • Cursos
            </Badge>
            <ProviderBadge />
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Cursos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cursos da instituição e seu nível acadêmico.
          </p>
        </div>

        <Button
          onClick={handleOpenCreateModal}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl"
        >
          <Plus className="h-4 w-4" />
          <span>Novo curso</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou código..."
            className="pl-9 rounded-xl"
          />
        </div>
      </div>

      <div className="glass rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80">
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Disciplinas</TableHead>
              <TableHead>Turmas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div role="alert" className="flex flex-col items-center gap-2 text-sm text-red-600">
                    <span>{loadError}</span>
                    <Button variant="outline" size="sm" onClick={fetchCourses} className="cursor-pointer">
                      Tentar novamente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Carregando cursos...
                </TableCell>
              </TableRow>
            ) : filteredCourses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Nenhum curso cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredCourses.map((course) => (
                <TableRow key={course.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    {course.name}
                  </TableCell>
                  <TableCell className="text-xs text-brand-teal font-mono">{course.code}</TableCell>
                  <TableCell className="text-sm">
                    {ACADEMIC_LEVEL_LABELS[course.academicLevel] ?? course.academicLevel}
                  </TableCell>
                  <TableCell className="text-sm">{course._count?.disciplines ?? 0}</TableCell>
                  <TableCell className="text-sm">{course._count?.classes ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditModal(course)}
                      className="text-xs text-brand-teal hover:text-brand-teal/80 cursor-pointer"
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CourseFormModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setEditingCourse(null);
        }}
        editingCourse={editingCourse}
        onSuccess={() => fetchCourses()}
      />
    </div>
  );
}
