'use client';

import * as React from 'react';
import {
  BookOpen,
  Plus,
  Users,
  Search,
  Layers,
  UserPlus,
} from 'lucide-react';
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
  TeacherCreateModal,
  type Teacher,
} from './_components/TeacherCreateModal';
import {
  SubjectFormModal,
  type OfferingItem,
} from './_components/SubjectFormModal';
import {
  ClassFormModal,
  type ClassOption,
} from '../classes/_components/ClassFormModal';
import { API_ROUTES } from '@/lib/constants/routes';

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = React.useState<OfferingItem[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = React.useState(false);
  const [editingSubject, setEditingSubject] = React.useState<OfferingItem | null>(null);
  const [selectedTeachers, setSelectedTeachers] = React.useState<string[]>([]);
  const [isClassModalOpen, setIsClassModalOpen] = React.useState(false);
  const [selectedClassId, setSelectedClassId] = React.useState<string | null>(null);

  const fetchSubjectData = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [resSub, resTeach, resClasses] = await Promise.all([
        fetch(API_ROUTES.ADMIN_SUBJECTS),
        fetch(API_ROUTES.ADMIN_TEACHERS),
        fetch(API_ROUTES.ADMIN_CLASSES),
      ]);
      const [dataSub, dataTeach, dataClasses] = await Promise.all([
        resSub.json(),
        resTeach.json(),
        resClasses.json(),
      ]);
      if (!dataSub.success || !dataTeach.success || !dataClasses.success) {
        throw new Error(dataSub.error || dataTeach.error || dataClasses.error);
      }
      setSubjects(dataSub.subjects);
      setTeachers(dataTeach.teachers);
      setClasses(dataClasses.classes);
    } catch {
      setLoadError('Não foi possível carregar ofertas, professores e turmas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSubjectData();
  }, [fetchSubjectData]);

  const handleOpenCreateModal = () => {
    setEditingSubject(null);
    setSelectedTeachers([]);
    setSelectedClassId(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sub: OfferingItem) => {
    setEditingSubject(sub);
    setSelectedTeachers(sub.teacherAssignments.map((ta) => ta.teacher.id));
    setSelectedClassId(sub.class.id);
    setIsModalOpen(true);
  };

  const handleTeacherCreated = (newTeacher: Teacher) => {
    fetchSubjectData();
    setSelectedTeachers((prev) => [...prev, newTeacher.id]);
  };

  const handleClassCreated = (klass: ClassOption) => {
    setClasses((prev) => (prev.some((c) => c.id === klass.id) ? prev : [...prev, klass]));
    fetchSubjectData();
    setSelectedClassId(klass.id);
  };

  const subjectCount = subjects.length;
  const withoutTeacherCount = subjects.filter((s) => s.teacherAssignments.length === 0).length;
  const allocatedTeacherCount = new Set(
    subjects.flatMap((s) => s.teacherAssignments.map((ta) => ta.teacher.id))
  ).size;

  const query = search.toLowerCase();
  const filteredSubjects = subjects.filter((s) =>
    [s.discipline.code, s.discipline.name, s.class.name, s.class.code, s.class.course.code, s.class.course.name].some((v) =>
      v.toLowerCase().includes(query),
    ),
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 0 • Ofertas
            </Badge>
            <ProviderBadge />
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Ofertas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Disciplinas da matriz ofertadas em cada turma, com os professores alocados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Modal 1: Cadastrar Novo Professor */}
          <Button
            variant="outline"
            onClick={() => setIsTeacherModalOpen(true)}
            className="gap-2 cursor-pointer rounded-xl border-slate-300"
          >
            <UserPlus className="h-4 w-4 text-brand-teal" />
            <span>+ Cadastrar Novo Professor</span>
          </Button>

          {/* Modal 2: Nova / Editar oferta */}
          <Button
            onClick={handleOpenCreateModal}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl"
          >
            <Plus className="h-4 w-4" />
            <span>Nova oferta</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards (derivados da lista carregada) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Ofertas cadastradas', value: subjectCount, icon: <BookOpen className="h-4 w-4 text-brand-teal" /> },
          { label: 'Ofertas sem professor', value: withoutTeacherCount, icon: <Layers className="h-4 w-4 text-brand-teal" /> },
          { label: 'Professores alocados', value: allocatedTeacherCount, icon: <Users className="h-4 w-4 text-brand-orange" /> },
        ].map((kpi) => (
          <div key={kpi.label} className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">{kpi.label}</span>
              {kpi.icon}
            </div>
            <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
              {loadError ? (
                <span className="text-sm font-medium text-slate-500">indisponível</span>
              ) : loading ? (
                '—'
              ) : (
                kpi.value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por disciplina, turma ou curso..."
            className="pl-9 rounded-xl"
          />
        </div>

      </div>

      {/* Table Component */}
      <div className="glass rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80">
            <TableRow>
              <TableHead>Disciplina</TableHead>
              <TableHead>Turma</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Professores</TableHead>
              <TableHead>Planos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div role="alert" className="flex flex-col items-center gap-2 text-sm text-red-600">
                    <span>{loadError}</span>
                    <Button variant="outline" size="sm" onClick={fetchSubjectData} className="cursor-pointer">
                      Tentar novamente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                  Carregando ofertas...
                </TableCell>
              </TableRow>
            ) : filteredSubjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                  Nenhuma oferta cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredSubjects.map((sub) => (
                <TableRow key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    {`${sub.discipline.code} · ${sub.discipline.name}`}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span>{sub.class.name}</span>
                      <span className="text-xs text-slate-400 font-mono">{sub.class.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{sub.class.course.code}</TableCell>
                  <TableCell className="text-sm">{sub.class.academicPeriod.code}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {sub.teacherAssignments.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">Sem professor</span>
                      ) : (
                        sub.teacherAssignments.map((ta, i) => (
                          <Badge key={i} className="bg-brand-teal/10 text-brand-teal border-brand-teal/20 text-xs">
                            {ta.teacher.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{sub.teachingPlans.length}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditModal(sub)}
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

      {/* Overlays / Modals */}
      <TeacherCreateModal
        open={isTeacherModalOpen}
        onOpenChange={setIsTeacherModalOpen}
        onSuccess={handleTeacherCreated}
      />

      <ClassFormModal
        open={isClassModalOpen}
        onOpenChange={setIsClassModalOpen}
        editingClass={null}
        onSuccess={handleClassCreated}
      />

      <SubjectFormModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setEditingSubject(null);
        }}
        editingSubject={editingSubject}
        teachers={teachers}
        classes={classes}
        selectedTeachers={selectedTeachers}
        setSelectedTeachers={setSelectedTeachers}
        selectedClassId={selectedClassId}
        setSelectedClassId={setSelectedClassId}
        onSuccess={fetchSubjectData}
        onRequestCreateTeacher={() => setIsTeacherModalOpen(true)}
        onRequestCreateClass={() => setIsClassModalOpen(true)}
      />
    </div>
  );
}
