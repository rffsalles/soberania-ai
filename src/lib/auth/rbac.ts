import { Role } from '@prisma/client';

export const AUTH_COOKIE_NAME = 'soberania_session' as const;

export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/api/v1/auth/login',
] as const;

export const PROTECTED_ROUTE_ROLES: Record<string, Role[]> = {
  '/appliance': [Role.ADMIN],
  '/materials': [Role.TEACHER, Role.ADMIN],
  '/reports': [Role.TEACHER, Role.ADMIN],
  '/pitch': [Role.STUDENT, Role.TEACHER, Role.ADMIN],
  '/dashboard': [Role.STUDENT, Role.TEACHER, Role.ADMIN],
  '/classroom': [Role.STUDENT, Role.TEACHER, Role.ADMIN],
  '/exam': [Role.STUDENT, Role.TEACHER, Role.ADMIN],
  '/study-group': [Role.STUDENT, Role.TEACHER, Role.ADMIN],
} as const;

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
  for (const [prefix, allowedRoles] of Object.entries(PROTECTED_ROUTE_ROLES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return allowedRoles.includes(role);
    }
  }
  // Rotas não listadas explicitamente mas internas: permitido a qualquer autenticado
  return true;
}

/**
 * Retorna a rota inicial padrão para cada papel após o login.
 */
export function getDefaultRouteForRole(role: Role): string {
  switch (role) {
    case Role.ADMIN:
      return '/appliance';
    case Role.TEACHER:
      return '/materials';
    case Role.STUDENT:
    default:
      return '/dashboard';
  }
}
