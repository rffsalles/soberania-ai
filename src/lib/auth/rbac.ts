import { Role } from '@prisma/client';
import { API_ROUTES, ROUTES } from '@/lib/constants/routes';

export const AUTH_COOKIE_NAME = 'soberania_session' as const;

export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/api/v1/auth/login',
] as const;

const ALL_ROLES: readonly Role[] = [Role.STUDENT, Role.TEACHER, Role.ADMIN];
const STAFF_ROLES: readonly Role[] = [Role.TEACHER, Role.ADMIN];
const ADMIN_ONLY: readonly Role[] = [Role.ADMIN];

/**
 * Matriz prefixo -> papéis. O prefixo mais específico vence
 * (ex.: /api/v1/admin/subjects libera TEACHER dentro de /api/v1/admin).
 */
export const PROTECTED_ROUTE_ROLES: Readonly<Record<string, readonly Role[]>> = {
  [ROUTES.DASHBOARD]: ALL_ROLES,
  [ROUTES.CLASSROOM]: ALL_ROLES,
  [ROUTES.STUDY_GROUP]: ALL_ROLES,
  [ROUTES.EXAM]: ALL_ROLES,
  [ROUTES.OFFICE_HOURS]: ALL_ROLES,
  [ROUTES.DRAFT_REVIEW]: ALL_ROLES,
  [ROUTES.PITCH]: ALL_ROLES,
  // Legado: vira redirect para /teacher/materials, precisa continuar alcançável.
  [ROUTES.MATERIALS]: ALL_ROLES,
  [ROUTES.TEACHER]: STAFF_ROLES,
  [ROUTES.REPORTS]: STAFF_ROLES,
  [ROUTES.ADMIN]: ADMIN_ONLY,
  [ROUTES.APPLIANCE]: ADMIN_ONLY,
  [API_ROUTES.AGENT]: ALL_ROLES,
  [API_ROUTES.AGENDAS]: ALL_ROLES,
  [API_ROUTES.PEDAGOGY]: ALL_ROLES,
  [API_ROUTES.EXAMS]: ALL_ROLES,
  [API_ROUTES.DRAFTS]: ALL_ROLES,
  [API_ROUTES.AUTH_ME]: ALL_ROLES,
  [API_ROUTES.AUTH_LOGOUT]: ALL_ROLES,
  [API_ROUTES.TEACHER]: STAFF_ROLES,
  [API_ROUTES.LIBRARY]: STAFF_ROLES,
  [API_ROUTES.MCP]: STAFF_ROLES,
  // Escrita restrita a ADMIN fica em requireUser na rota.
  [API_ROUTES.ADMIN_SUBJECTS]: STAFF_ROLES,
  // Escrita restrita a ADMIN fica em requireUser na rota.
  [API_ROUTES.ADMIN_CLASSES]: STAFF_ROLES,
  [API_ROUTES.ACADEMIC_PERIODS]: STAFF_ROLES,
  [API_ROUTES.ADMIN]: ADMIN_ONLY,
  // Telemetria é somente leitura e alimenta o badge do cabeçalho (TEACHER/ADMIN); a página segue ADMIN_ONLY.
  [API_ROUTES.APPLIANCE]: STAFF_ROLES,
};

/** GET/POST /api/v1/teacher/lessons/:id/media — exceção à área restrita a staff. */
const LESSON_MEDIA_PATH = new RegExp(`^${API_ROUTES.TEACHER_LESSONS}/[^/]+/media/?$`);

/** Prefixos de área: caminhos autenticados sob eles e não listados são negados. */
const DENY_BY_DEFAULT_PREFIXES: readonly string[] = [
  API_ROUTES.ROOT,
  ROUTES.TEACHER,
  ROUTES.ADMIN,
  ROUTES.APPLIANCE,
  ROUTES.REPORTS,
  ROUTES.DASHBOARD,
  ROUTES.CLASSROOM,
  ROUTES.STUDY_GROUP,
  ROUTES.EXAM,
  ROUTES.OFFICE_HOURS,
  ROUTES.DRAFT_REVIEW,
  ROUTES.PITCH,
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/**
 * Verifica se uma rota é pública (não exige autenticação).
 */
export function isPublicRoute(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login' || pathname === '/api/v1/auth/login') {
    return true;
  }
  // Arquivos estáticos
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/images') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.webp')
  ) {
    return true;
  }
  return false;
}

/**
 * Verifica se determinado papel possui permissão para acessar a rota.
 */
export function canAccessRoute(pathname: string, role: Role): boolean {
  // Mídia de aula: alunos assistem; o escopo (turma/professor) é verificado no serviço.
  if (LESSON_MEDIA_PATH.test(pathname)) return ALL_ROLES.includes(role);
  let bestPrefix: string | null = null;
  for (const prefix of Object.keys(PROTECTED_ROUTE_ROLES)) {
    if (matchesPrefix(pathname, prefix) && (bestPrefix === null || prefix.length > bestPrefix.length)) {
      bestPrefix = prefix;
    }
  }
  if (bestPrefix !== null) {
    return PROTECTED_ROUTE_ROLES[bestPrefix].includes(role);
  }
  // Negar por padrão em áreas e APIs não listadas.
  if (DENY_BY_DEFAULT_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return false;
  }
  // Demais caminhos (ex.: estáticos) seguem o comportamento anterior.
  return true;
}

/**
 * Retorna a rota inicial padrão para cada papel após o login.
 */
export function getDefaultRouteForRole(role: Role): string {
  switch (role) {
    case Role.ADMIN:
      return ROUTES.APPLIANCE;
    case Role.TEACHER:
      return ROUTES.TEACHER_PLANS;
    case Role.STUDENT:
    default:
      return ROUTES.DASHBOARD;
  }
}
