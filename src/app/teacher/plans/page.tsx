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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NDE_COMPLIANCE_STATUS } from '@/lib/constants/teaching';
import { API_ROUTES, ROUTES } from '@/lib/constants/routes';
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
  totalHours?: number;
  theoryHours?: number;
  practiceHours?: number;
  ndeComplianceStatus?: string;
  createdAt: string;
  updatedAt: string;
  subject: {
    id: string;
    discipline: { name: string; code: string };
    class: {
      name: string;
      course: { name: string; code: string };
      academicPeriod: { id: string; name: string; code: string; year: number };
    };
  };
}

export default function TeacherPlansListPage() {
  const [plans, setPlans] = React.useState<TeachingPlan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  const fetchPlans = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(API_ROUTES.TEACHER_PLANS);
      const data = await res.json();
      if (data.success && Array.isArray(data.plans)) {
        setPlans(data.plans);
      } else {
        setPlans([]);
      }
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const groups = React.useMemo(() => {
    const term = search.toLowerCase();
    const filtered = plans.filter((p) => {
      const { discipline, class: cls } = p.subject;
      return [discipline.name, discipline.code, cls.course.name, cls.name].some((v) =>
        v.toLowerCase().includes(term),
      );
    });
    const byPeriod = new Map<string, { period: TeachingPlan['subject']['class']['academicPeriod']; plans: TeachingPlan[] }>();
    for (const p of filtered) {
      const period = p.subject.class.academicPeriod;
      const group = byPeriod.get(period.id);
      if (group) group.plans.push(p);
      else byPeriod.set(period.id, { period, plans: [p] });
    }
    return [...byPeriod.values()].sort(
      (a, b) => b.period.year - a.period.year || b.period.code.localeCompare(a.period.code),
    );
  }, [plans, search]);

  const totalMappedHours = React.useMemo(() => {
    return plans.reduce((acc, p) => acc + (p.totalHours ?? 0), 0);
  }, [plans]);

  // Parecer registrado pelo professor no plano: a única fonte de "aderência" que existe hoje.
  const ndeAlignedCount = plans.filter((p) => p.ndeComplianceStatus === NDE_COMPLIANCE_STATUS.OK).length;
  const ndeAlignedPercent = plans.length > 0 ? Math.round((ndeAlignedCount / plans.length) * 100) : null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>Aprovado pelo professor</span>
          </Badge>
        );
      case 'IN_REVIEW':
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
            <Clock className="h-3 w-3" />
            <span>Em Análise</span>
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
    <div className="p-6 mx-auto space-y-6">
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

        <Link href={ROUTES.TEACHER_PLANS_NEW}>
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
          <span className="text-[11px] text-brand-teal font-medium">Rascunhos</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Aprovados</span>
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
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
            {totalMappedHours}h
          </p>
          <span className="text-[11px] text-slate-500 font-medium">Soma das cargas horárias informadas</span>
        </div>

        <div className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Parecer NDE alinhado às DCNs</span>
            <Sparkles className="h-4 w-4 text-brand-orange" />
          </div>
          <p className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
            {ndeAlignedPercent === null ? '—' : `${ndeAlignedPercent}%`}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            {ndeAlignedCount} de {plans.length} plano(s) com parecer registrado como alinhado
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar plano por disciplina, curso ou turma..."
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
              <TableHead>Curso / Turma</TableHead>
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
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  Nenhum plano de ensino encontrado.
                </TableCell>
              </TableRow>
            ) : (
              groups.map(({ period, plans: groupPlans }) => (
                <React.Fragment key={period.id}>
                  <TableRow className="bg-slate-50/60 dark:bg-slate-900/60 hover:bg-slate-50/60">
                    <TableCell colSpan={6} role="rowheader" className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      {period.name}
                    </TableCell>
                  </TableRow>
                  {groupPlans.map((plan) => (
                    <TableRow key={plan.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="text-slate-900 dark:text-white font-semibold">
                            {plan.subject.discipline.name}
                          </span>
                          <span className="text-xs text-brand-teal font-mono">
                            {plan.subject.discipline.code}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span>{plan.subject.class.course.name}</span>
                          <span className="text-xs text-slate-500">{plan.subject.class.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(plan.status)}</TableCell>
                      <TableCell className="text-sm text-slate-600 font-medium">
                        {plan.totalHours != null ? `${plan.totalHours}h` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(plan.updatedAt).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`${ROUTES.TEACHER_PLANS_NEW}?id=${plan.id}`}>
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
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

