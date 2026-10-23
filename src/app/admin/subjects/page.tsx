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
  type SubjectItem,
} from './_components/SubjectFormModal';
import type { ClassOption } from './_components/SubjectFormModal';
import { API_ROUTES } from '@/lib/constants/routes';

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = React.useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = React.useState(false);
  const [editingSubject, setEditingSubject] = React.useState<SubjectItem | null>(null);
  const [selectedTeachers, setSelectedTeachers] = React.useState<string[]>([]);

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
      setLoadError('Não foi possível carregar disciplinas, professores e turmas. Tente novamente.');
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
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sub: SubjectItem) => {
    setEditingSubject(sub);
    setSelectedTeachers(sub.teacherAssignments.map((ta) => ta.teacher.id));
    setIsModalOpen(true);
  };

  const handleTeacherCreated = (newTeacher: Teacher) => {
    fetchSubjectData();
    setSelectedTeachers((prev) => [...prev, newTeacher.id]);
  };

  const subjectCount = subjects.length;
  const withClassCount = subjects.filter((s) => s.class || s.classId).length;
  const allocatedTeacherCount = new Set(
    subjects.flatMap((s) => s.teacherAssignments.map((ta) => ta.teacher.id))
  ).size;

  const filteredSubjects = subjects.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.courseName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 0 • Governança N:N
            </Badge>
            <ProviderBadge />
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Gestão N:N de Professores & Disciplinas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Alocação docente multidimensional para escolas e faculdades.
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

          {/* Modal 2: Nova / Editar Disciplina & Vínculos */}
          <Button
            onClick={handleOpenCreateModal}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl"
          >
            <Plus className="h-4 w-4" />
            <span>+ Vincular Professor a Disciplina</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards (derivados da lista carregada) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Disciplinas cadastradas', value: subjectCount, icon: <BookOpen className="h-4 w-4 text-brand-teal" /> },
          { label: 'Com turma vinculada', value: withClassCount, icon: <Layers className="h-4 w-4 text-brand-teal" /> },
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
            placeholder="Buscar por disciplina ou curso..."
            className="pl-9 rounded-xl"
          />
        </div>

      </div>

      {/* Table Component */}
      <div className="glass rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80">
            <TableRow>
              <TableHead>Código & Disciplina</TableHead>
              <TableHead>Curso / Ano</TableHead>
              <TableHead>Turma</TableHead>
              <TableHead>Nível Acadêmico</TableHead>
              <TableHead>Professores Alocados (N:N)</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
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
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Carregando disciplinas...
                </TableCell>
              </TableRow>
            ) : filteredSubjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Nenhuma disciplina cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredSubjects.map((sub) => (
                <TableRow key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="text-slate-900 dark:text-white font-semibold">{sub.name}</span>
                      <span className="text-xs text-brand-teal font-mono">{sub.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{sub.courseName}</TableCell>
                  <TableCell className="text-sm">
                    {sub.class ? (
                      <span>
                        {sub.class.name} <span className="text-xs text-slate-400 font-mono">{sub.class.code}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 italic">Sem turma</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {sub.academicLevel === 'HIGHER_EDUCATION' ? 'Ensino Superior' : 'Ensino Médio'}
                    </Badge>
                  </TableCell>
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
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditModal(sub)}
                      className="text-xs text-brand-teal hover:text-brand-teal/80 cursor-pointer"
                    >
                      Editar Vínculo
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
        onSuccess={fetchSubjectData}
        onRequestCreateTeacher={() => setIsTeacherModalOpen(true)}
      />
    </div>
  );
}
