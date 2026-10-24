import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth/rbac';
import { getSessionUser } from '@/lib/auth/session';
import { findClassContext } from '@/domains/academic/services/class-repository';

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Não autenticado. Sessão inexistente.' },
        { status: 401 }
      );
    }

    const user = await getSessionUser(sessionCookie);

    if (!user) {
      const response = NextResponse.json(
        { error: 'Sessão expirada ou revogada.' },
        { status: 401 }
      );
      response.cookies.delete(AUTH_COOKIE_NAME);
      return response;
    }

    const classContext = user.classId ? await findClassContext(user.classId) : null;

    return NextResponse.json({ user: { ...user, class: classContext } });
  } catch (error) {
    console.error('Erro ao obter sessão atual:', error);
    return NextResponse.json(
      { error: 'Erro interno ao consultar sessão.' },
      { status: 500 }
    );
  }
}
