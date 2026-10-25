import { Role } from '@prisma/client';
import {
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Library,
  Presentation,
  Server,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const STUDENT_LINKS: readonly NavLink[] = [
  { href: ROUTES.DASHBOARD, label: 'Painel', icon: LayoutDashboard },
];

const TEACHER_LINKS: readonly NavLink[] = [
  { href: ROUTES.TEACHER_PLANS, label: 'Planos de Ensino', icon: ClipboardList },
  { href: ROUTES.TEACHER_SCHEDULES, label: 'Cronogramas', icon: CalendarDays },
  { href: ROUTES.TEACHER_LESSONS, label: 'Aulas', icon: Presentation },
  { href: ROUTES.TEACHER_ASSESSMENTS, label: 'Avaliações', icon: FileCheck2 },
  { href: ROUTES.TEACHER_MATERIALS, label: 'Acervo RAG', icon: BookOpen },
  { href: ROUTES.REPORTS, label: 'Relatórios', icon: BarChart3 },
];

const ADMIN_LINKS: readonly NavLink[] = [
  { href: ROUTES.ADMIN_COURSES, label: 'Cursos', icon: GraduationCap },
  { href: ROUTES.ADMIN_DISCIPLINES, label: 'Disciplinas', icon: Library },
  { href: ROUTES.ADMIN_CLASSES, label: 'Turmas', icon: Users },
  { href: ROUTES.ADMIN_SUBJECTS, label: 'Ofertas', icon: BookMarked },
  { href: ROUTES.APPLIANCE, label: 'Telemetria', icon: Server },
  ...TEACHER_LINKS,
];

/** Menu principal de cada papel. Os `href` vêm de ROUTES; o RBAC continua sendo a autoridade de acesso. */
export const NAV_LINKS_BY_ROLE: Readonly<Record<Role, readonly NavLink[]>> = {
  [Role.STUDENT]: STUDENT_LINKS,
  [Role.TEACHER]: TEACHER_LINKS,
  [Role.ADMIN]: ADMIN_LINKS,
};

/** Lista do papel, ou vazia quando o papel é desconhecido ou ausente. */
export function getNavLinksForRole(role: Role | string | undefined): readonly NavLink[] {
  if (!role || !(role in NAV_LINKS_BY_ROLE)) return [];
  return NAV_LINKS_BY_ROLE[role as Role];
}
