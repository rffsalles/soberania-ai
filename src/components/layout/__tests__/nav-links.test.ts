import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { BookMarked, GraduationCap, Library, Users } from 'lucide-react';
import { canAccessRoute } from '@/lib/auth/rbac';
import { ROUTES } from '@/lib/constants/routes';
import { NAV_LINKS_BY_ROLE, getNavLinksForRole } from '../nav-links';

const labels = (role: Role) => NAV_LINKS_BY_ROLE[role].map((l) => l.label);

describe('NAV_LINKS_BY_ROLE', () => {
  it('só lista rotas que o papel pode acessar', () => {
    for (const role of Object.values(Role)) {
      for (const link of NAV_LINKS_BY_ROLE[role]) {
        expect(canAccessRoute(link.href, role), `${role} ${link.href}`).toBe(true);
      }
    }
  });

  it('aluno vê só o Painel', () => {
    expect(NAV_LINKS_BY_ROLE[Role.STUDENT].map((l) => l.href)).toEqual([ROUTES.DASHBOARD]);
    expect(labels(Role.STUDENT)).toEqual(['Painel']);
  });

  it('professor vê as seis telas docentes, nesta ordem', () => {
    expect(labels(Role.TEACHER)).toEqual([
      'Planos de Ensino',
      'Cronogramas',
      'Aulas',
      'Avaliações',
      'Acervo RAG',
      'Relatórios',
    ]);
    expect(NAV_LINKS_BY_ROLE[Role.TEACHER].map((l) => l.href)).toEqual([
      ROUTES.TEACHER_PLANS,
      ROUTES.TEACHER_SCHEDULES,
      ROUTES.TEACHER_LESSONS,
      ROUTES.TEACHER_ASSESSMENTS,
      ROUTES.TEACHER_MATERIALS,
      ROUTES.REPORTS,
    ]);
  });

  it('admin vê Cursos, Disciplinas, Turmas, Ofertas e Telemetria, seguidos da lista do professor', () => {
    expect(labels(Role.ADMIN)).toEqual(['Cursos', 'Disciplinas', 'Turmas', 'Ofertas', 'Telemetria', ...labels(Role.TEACHER)]);
    expect(NAV_LINKS_BY_ROLE[Role.ADMIN].slice(0, 5).map((l) => l.href)).toEqual([
      ROUTES.ADMIN_COURSES,
      ROUTES.ADMIN_DISCIPLINES,
      ROUTES.ADMIN_CLASSES,
      ROUTES.ADMIN_SUBJECTS,
      ROUTES.APPLIANCE,
    ]);
    expect(NAV_LINKS_BY_ROLE[Role.ADMIN].slice(0, 4).map((l) => l.icon)).toEqual([GraduationCap, Library, Users, BookMarked]);
  });

  it('professor não vê rotas de admin', () => {
    for (const link of NAV_LINKS_BY_ROLE[Role.TEACHER]) {
      expect(link.href.startsWith(ROUTES.ADMIN)).toBe(false);
      expect(link.href).not.toBe(ROUTES.APPLIANCE);
    }
  });

  it('getNavLinksForRole devolve lista vazia para papel desconhecido ou ausente', () => {
    expect(getNavLinksForRole(undefined)).toEqual([]);
    expect(getNavLinksForRole('SUPERUSER')).toEqual([]);
    expect(getNavLinksForRole(Role.TEACHER)).toBe(NAV_LINKS_BY_ROLE[Role.TEACHER]);
  });
});
