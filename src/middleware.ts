import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAuthToken } from '@/lib/auth/token';
import {
  AUTH_COOKIE_NAME,
  canAccessRoute,
  getDefaultRouteForRole,
  isPublicRoute,
} from '@/lib/auth/rbac';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Permite acesso a recursos estáticos imediatos
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/icon')
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const tokenPayload = sessionCookie ? await verifyAuthToken(sessionCookie) : null;

  // 2. Tratamento da tela de Login
  if (pathname === '/login') {
    if (tokenPayload) {
      // Usuário já autenticado tentando acessar o login: redireciona ao painel correspondente
      const targetUrl = request.nextUrl.clone();
      targetUrl.pathname = getDefaultRouteForRole(tokenPayload.role);
      targetUrl.search = '';
      return NextResponse.redirect(targetUrl);
    }
    return NextResponse.next();
  }

  // 3. Rotas Públicas (apenas a Landing Page '/')
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 4. Todas as demais rotas são PROTEGIDAS (/pitch, /(student)/*, /(teacher)/*, /(admin)/*, /api/v1/*)
  if (!tokenPayload) {
    // Caso seja chamada de API
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Não autorizado. Sessão ativa necessária.' },
        { status: 401 }
      );
    }

    // Para páginas web normais: redireciona para /login com parâmetro de retorno
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);

    const response = NextResponse.redirect(loginUrl);
    if (sessionCookie) {
      // Se havia um cookie inválido/expirado, limpa-o
      response.cookies.delete(AUTH_COOKIE_NAME);
    }
    return response;
  }

  // 5. Verificação de Papéis (RBAC)
  const hasPermission = canAccessRoute(pathname, tokenPayload.role);
  if (!hasPermission) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Acesso negado. Seu perfil não possui privilégios para este recurso.' },
        { status: 403 }
      );
    }

    // Se usuário tentar acessar rota fora do seu perfil, redireciona para seu próprio dashboard
    const fallbackUrl = request.nextUrl.clone();
    fallbackUrl.pathname = getDefaultRouteForRole(tokenPayload.role);
    fallbackUrl.search = '';
    return NextResponse.redirect(fallbackUrl);
  }

  // 6. Injeta headers de auditoria e contexto para Server Components e API Routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', tokenPayload.sub);
  requestHeaders.set('x-user-role', tokenPayload.role);
  requestHeaders.set('x-user-email', tokenPayload.email);
  if (tokenPayload.enrollment) {
    requestHeaders.set('x-user-enrollment', tokenPayload.enrollment);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Intercepta todas as rotas exceto assets estáticos compilados
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
