'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import type { CourseOption } from '@/app/admin/courses/_components/CourseFormModal';
import { DisciplineFormModal, type DisciplineOption } from './_components/DisciplineFormModal';
import { API_ROUTES } from '@/lib/constants/routes';

export default function AdminDisciplinesPage() {
  const [disciplines, setDisciplines] = React.useState<DisciplineOption[]>([]);
  const [courses, setCourses] = React.useState<CourseOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [courseFilter, setCourseFilter] = React.useState('');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingDiscipline, setEditingDiscipline] = React.useState<DisciplineOption | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [disciplinesRes, coursesRes] = await Promise.all([
        fetch(API_ROUTES.ADMIN_DISCIPLINES),
        fetch(API_ROUTES.ADMIN_COURSES),
      ]);
      const [disciplinesData, coursesData] = await Promise.all([
        disciplinesRes.json(),
        coursesRes.json(),
      ]);
      if (!disciplinesData.success || !coursesData.success) {
        throw new Error(disciplinesData.error || coursesData.error);
      }
      setDisciplines(disciplinesData.disciplines);
      setCourses(coursesData.courses);
    } catch {
      setLoadError('Não foi possível carregar disciplinas e cursos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenCreateModal = () => {
    setEditingDiscipline(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (discipline: DisciplineOption) => {
    setEditingDiscipline(discipline);
    setIsModalOpen(true);
  };

  const filtered = courseFilter
    ? disciplines.filter((d) => d.courseId === courseFilter)
    : disciplines;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 0 • Matriz curricular
            </Badge>
            <ProviderBadge />
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Disciplinas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Disciplinas da matriz curricular de cada curso.
          </p>
        </div>

        <Button
          onClick={handleOpenCreateModal}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl"
        >
          <Plus className="h-4 w-4" />
          <span>Nova disciplina</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Label htmlFor="discipline-course-filter">Curso</Label>
        <select
          id="discipline-course-filter"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="w-full sm:w-80 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 cursor-pointer"
        >
          <option value="">Todos</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {`${c.code} · ${c.name}`}
            </option>
          ))}
        </select>
      </div>

      <div className="glass rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80">
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Carga horária</TableHead>
              <TableHead>Ofertas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
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
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Carregando disciplinas...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Nenhuma disciplina cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="text-xs text-brand-teal font-mono">{d.code}</TableCell>
                  <TableCell className="font-medium text-slate-900 dark:text-white">{d.name}</TableCell>
                  <TableCell className="text-sm">{d.course.code}</TableCell>
                  <TableCell className="text-sm">{`${d.workloadHours} h`}</TableCell>
                  <TableCell className="text-sm">{d._count?.offerings ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditModal(d)}
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

      <DisciplineFormModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setEditingDiscipline(null);
        }}
        editingDiscipline={editingDiscipline}
        courses={courses}
        defaultCourseId={courseFilter || null}
        onSuccess={() => fetchData()}
      />
    </div>
  );
}
