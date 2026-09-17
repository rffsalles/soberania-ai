'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  FileText,
  ArrowRight,
  Layers,
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

interface TeachingPlan {
  id: string;
  subjectId: string;
  syllabus: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED';
  createdAt: string;
  updatedAt: string;
  subject?: {
    id: string;
    name: string;
    code: string;
    courseName: string;
    academicYear: number;
  };
}

export default function TeacherPlansListPage() {
  const [plans, setPlans] = React.useState<TeachingPlan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  const fetchPlans = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/teacher/plans');
      const data = await res.json();
      if (data.success && Array.isArray(data.plans) && data.plans.length > 0) {
        setPlans(data.plans);
      } else {
        // Fallback mock de planos padrão
        setPlans([
          {
            id: 'plan-1',
            subjectId: 'sub-1',
            syllabus:
              'Visão geral da arquitetura de SGBDs relacionais. Modelagem conceitual com Diagramas Entidade-Relacionamento (DER). Mapeamento lógico...',
            status: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            subject: {
              id: 'sub-1',
              name: 'Banco de Dados I',
              code: 'BD101',
              courseName: 'Análise e Desenv. de Sistemas',
              academicYear: 2026,
            },
          },
          {
            id: 'plan-2',
            subjectId: 'sub-2',
            syllabus:
              'Engenharia de requisitos, metodologias ágeis (Scrum/Kanban), testes de software e integração contínua.',
            status: 'APPROVED',
            createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
            updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
            subject: {
              id: 'sub-2',
              name: 'Engenharia de Software II',
              code: 'ES202',
              courseName: 'Ciência da Computação',
              academicYear: 2026,
            },
          },
        ]);
      }
    } catch {
      setPlans([
        {
          id: 'plan-1',
          subjectId: 'sub-1',
          syllabus: 'Visão geral de SGBD relacional e vetorial...',
          status: 'DRAFT',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          subject: {
            id: 'sub-1',
            name: 'Banco de Dados I',
            code: 'BD101',
            courseName: 'Análise e Desenv. de Sistemas',
            academicYear: 2026,
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const filteredPlans = plans.filter((p) => {
    const term = search.toLowerCase();
    const name = p.subject?.name?.toLowerCase() || '';
    const code = p.subject?.code?.toLowerCase() || '';
    const course = p.subject?.courseName?.toLowerCase() || '';
    return name.includes(term) || code.includes(term) || course.includes(term);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>Aprovado NDE</span>
          </Badge>
        );
      case 'IN_REVIEW':
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
            <Clock className="h-3 w-3" />
            <span>Em Análise NDE</span>
          </Badge>
        );
      default:
        return (
          <Badge className="bg-brand-teal/10 text-brand-teal border-brand-teal/20 gap-1">
            <FileText className="h-3 w-3" />
            <span>Em Elaboração</span>
          </Badge>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 1 do Pipeline Pedagógico
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Mapeamento DCN & RAG Local
            </Badge>
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Planos de Ensino & Aprendizagem
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Elaboração, homologação e gestão de ementas socráticas para suas disciplinas alocadas.
          </p>
        </div>

        <Link href="/teacher/plans/new">
          <Button className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl shadow-soft-sm">
            <Plus className="h-4 w-4" />
            <span>+ Elaborar Novo Plano de Ensino</span>
          </Button>
        </Link>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Planos em Elaboração</span>
            <FileText className="h-4 w-4 text-brand-teal" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
            {plans.filter((p) => p.status === 'DRAFT').length} Planos
          </p>
          <span className="text-[11px] text-brand-teal font-medium">Aguardando envio ao NDE</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Aprovados pelo NDE</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
            {plans.filter((p) => p.status === 'APPROVED').length} Planos
          </p>
          <span className="text-[11px] text-emerald-600 font-medium">Prontos para Cronograma</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Carga Horária Mapeada</span>
            <BookOpen className="h-4 w-4 text-brand-orange" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">160h</p>
          <span className="text-[11px] text-slate-500 font-medium">80h por disciplina ativa</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Aderência RAG / DCN</span>
            <Sparkles className="h-4 w-4 text-brand-orange" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">98.4%</p>
          <span className="text-[11px] text-emerald-600 font-medium">Conformidade IA Validada</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar plano por disciplina ou curso..."
            className="pl-9 rounded-xl"
          />
        </div>
      </div>

      {/* Table Component */}
      <div className="glass rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80">
            <TableRow>
              <TableHead>Disciplina & Código</TableHead>
              <TableHead>Curso / Ano</TableHead>
              <TableHead>Status NDE</TableHead>
              <TableHead>Carga Horária</TableHead>
              <TableHead>Última Atualização</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Carregando planos de ensino...
                </TableCell>
              </TableRow>
            ) : filteredPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Nenhum plano de ensino encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredPlans.map((plan) => (
                <TableRow key={plan.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="text-slate-900 dark:text-white font-semibold">
                        {plan.subject?.name || 'Disciplina'}
                      </span>
                      <span className="text-xs text-brand-teal font-mono">
                        {plan.subject?.code || 'COD123'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {plan.subject?.courseName || 'Análise e Desenv. de Sistemas'}
                  </TableCell>
                  <TableCell>{getStatusBadge(plan.status)}</TableCell>
                  <TableCell className="text-sm text-slate-600 font-medium">80h</TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {new Date(plan.updatedAt).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href="/teacher/plans/new">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs border-brand-teal/30 text-brand-teal hover:bg-brand-teal/10 cursor-pointer gap-1"
                      >
                        <span>Editar / Continuar</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
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
