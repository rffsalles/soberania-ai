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
import { ClassFormModal, type ClassOption } from './_components/ClassFormModal';
import { API_ROUTES } from '@/lib/constants/routes';

export default function AdminClassesPage() {
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingClass, setEditingClass] = React.useState<ClassOption | null>(null);

  const fetchClasses = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(API_ROUTES.ADMIN_CLASSES);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      setClasses(data.classes);
    } catch {
      setLoadError('Não foi possível carregar as turmas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleOpenCreateModal = () => {
    setEditingClass(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (klass: ClassOption) => {
    setEditingClass(klass);
    setIsModalOpen(true);
  };

  const term = search.toLowerCase();
  const filteredClasses = classes.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      c.code.toLowerCase().includes(term) ||
      c.course.code.toLowerCase().includes(term)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 0 • Turmas
            </Badge>
            <ProviderBadge />
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Turmas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Turmas de cada curso por período letivo.
          </p>
        </div>

        <Button
          onClick={handleOpenCreateModal}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl"
        >
          <Plus className="h-4 w-4" />
          <span>+ Nova turma</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, código ou curso..."
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
              <TableHead>Curso</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Posição</TableHead>
              <TableHead>Alunos</TableHead>
              <TableHead>Ofertas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <div role="alert" className="flex flex-col items-center gap-2 text-sm text-red-600">
                    <span>{loadError}</span>
                    <Button variant="outline" size="sm" onClick={fetchClasses} className="cursor-pointer">
                      Tentar novamente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                  Carregando turmas...
                </TableCell>
              </TableRow>
            ) : filteredClasses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                  Nenhuma turma cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredClasses.map((klass) => (
                <TableRow key={klass.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium text-slate-900 dark:text-white">
                    {klass.name}
                  </TableCell>
                  <TableCell className="text-xs text-brand-teal font-mono">{klass.code}</TableCell>
                  <TableCell className="text-sm">{klass.course.code}</TableCell>
                  <TableCell className="text-sm">{klass.academicPeriod.code}</TableCell>
                  <TableCell className="text-sm">{klass.semester}</TableCell>
                  <TableCell className="text-sm">{klass._count?.students ?? 0}</TableCell>
                  <TableCell className="text-sm">{klass._count?.subjects ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditModal(klass)}
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

      <ClassFormModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setEditingClass(null);
        }}
        editingClass={editingClass}
        onSuccess={() => fetchClasses()}
      />
    </div>
  );
}
