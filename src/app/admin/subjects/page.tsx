'use client';

import * as React from 'react';
import {
  BookOpen,
  Plus,
  Users,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Teacher {
  id: string;
  name: string;
  email: string;
  enrollment: string;
}

interface Subject {
  id: string;
  name: string;
  code: string;
  courseName: string;
  academicLevel: string;
  academicYear: number;
  teacherAssignments: { teacher: Teacher }[];
}

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Form State
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [courseName, setCourseName] = React.useState('');
  const [selectedTeachers, setSelectedTeachers] = React.useState<string[]>([]);

  const fetchSubjectData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [resSub, resTeach] = await Promise.all([
        fetch('/api/v1/admin/subjects'),
        fetch('/api/v1/admin/teachers'),
      ]);
      const dataSub = await resSub.json();
      const dataTeach = await resTeach.json();

      if (dataSub.success) setSubjects(dataSub.subjects);
      if (dataTeach.success) setTeachers(dataTeach.teachers);
    } catch {
      // Fallback mock se API offline
      setSubjects([
        {
          id: 'sub-1',
          name: 'Banco de Dados I',
          code: 'BD101',
          courseName: 'Análise e Desenv. de Sistemas',
          academicLevel: 'HIGHER_EDUCATION',
          academicYear: 2026,
          teacherAssignments: [
            {
              teacher: {
                id: 't-1',
                name: 'Prof. Ricardo Silva',
                email: 'ricardo@soberania.edu.br',
                enrollment: 'PROF001',
              },
            },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSubjectData();
  }, [fetchSubjectData]);

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/admin/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          courseName,
          academicLevel: 'HIGHER_EDUCATION',
          academicYear: 2026,
          teacherIds: selectedTeachers,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setName('');
        setCode('');
        setCourseName('');
        setSelectedTeachers([]);
        fetchSubjectData();
      }
    } catch {
      alert('Erro ao salvar disciplina.');
    }
  };

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
            <Badge variant="secondary" className="text-xs">
              Appliance 100% On-Premises
            </Badge>
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Gestão N:N de Professores & Disciplinas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Alocação docente multidimensional para escolas e faculdades.
          </p>
        </div>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl">
              <Plus className="h-4 w-4" />
              <span>+ Vincular Professor a Disciplina</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading">Nova Disciplina & Vínculos</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSubject} className="space-y-4 py-2">
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
                <Label>Professores Alocados (N:N)</Label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
                  {teachers.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 rounded hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedTeachers.includes(t.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedTeachers((prev) => [...prev, t.id]);
                          else setSelectedTeachers((prev) => prev.filter((id) => id !== t.id));
                        }}
                      />
                      <span>{t.name} ({t.enrollment})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-brand-teal text-white">
                  Salvar Vínculo
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Cursos Ativos</span>
            <Layers className="h-4 w-4 text-brand-teal" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">18 Cursos</p>
          <span className="text-[11px] text-emerald-600 font-medium">+2 semestres mapeados</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Disciplinas Cadastradas</span>
            <BookOpen className="h-4 w-4 text-brand-teal" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">142 Disciplinas</p>
          <span className="text-[11px] text-brand-teal font-medium">128 com Base RAG Local</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Professores Alocados</span>
            <Users className="h-4 w-4 text-brand-orange" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">86 Docentes</p>
          <span className="text-[11px] text-slate-500">74 com alocação ativa N:N</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Cobertura Socrática IA</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">94.2%</p>
          <span className="text-[11px] text-emerald-600 font-medium">Appliance local ativo</span>
        </div>
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

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="gap-2 text-xs h-9 rounded-xl border-slate-200">
            <Upload className="h-3.5 w-3.5" />
            <span>Upload em Lote (CSV/XLS)</span>
          </Button>
        </div>
      </div>

      {/* Table Component */}
      <div className="glass rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80">
            <TableRow>
              <TableHead>Código & Disciplina</TableHead>
              <TableHead>Curso / Ano</TableHead>
              <TableHead>Nível Acadêmico</TableHead>
              <TableHead>Professores Alocados (N:N)</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSubjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-slate-500">
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
                    <Button variant="ghost" size="sm" className="text-xs text-brand-teal cursor-pointer">
                      Editar Vínculo
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
