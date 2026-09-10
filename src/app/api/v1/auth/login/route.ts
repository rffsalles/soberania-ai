import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { loginSchema } from '@/lib/validators/auth.validator';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { getSessionCookieConfig } from '@/lib/auth/token';
import { ensureDemoUsersExist } from '@/lib/auth/seed-users';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = loginSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Dados de login inválidos.',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { identifier, password } = parseResult.data;
    const cleanIdentifier = identifier.trim();

    // Garante usuários de demonstração se banco estiver vazio
    await ensureDemoUsersExist();

    const user = await db.user.findFirst({
      where: {
        OR: [
          { enrollment: cleanIdentifier },
          { email: cleanIdentifier.toLowerCase() },
        ],
      },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Credenciais inválidas. Verifique sua matrícula ou senha.' },
        { status: 401 }
      );
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Credenciais inválidas. Verifique sua matrícula ou senha.' },
        { status: 401 }
      );
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const sessionData = await createSession(user.id, { ip, userAgent });
    if (!sessionData) {
      return NextResponse.json(
        { error: 'Não foi possível inicializar a sessão acadêmica.' },
        { status: 500 }
      );
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieConfig = getSessionCookieConfig(isProduction);

    const response = NextResponse.json({
      success: true,
      user: sessionData.user,
    });

    response.cookies.set({
      name: cookieConfig.name,
      value: sessionData.token,
      ...cookieConfig.options,
    });

    return response;
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar login soberano.' },
      { status: 500 }
    );
  }
}
