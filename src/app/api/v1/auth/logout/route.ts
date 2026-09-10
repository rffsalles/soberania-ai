import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth/rbac';
import { verifyAuthToken } from '@/lib/auth/token';
import { revokeSession } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;

    if (sessionCookie) {
      const payload = await verifyAuthToken(sessionCookie);
      if (payload?.sessionId) {
        // Revogação ativa no banco de dados
        await revokeSession(payload.sessionId);
      }
    }

    const response = NextResponse.json({
      success: true,
      message: 'Sessão encerrada com sucesso.',
    });

    // Remove o cookie do navegador
    response.cookies.delete(AUTH_COOKIE_NAME);

    return response;
  } catch (error) {
    console.error('Erro ao encerrar sessão:', error);
    const response = NextResponse.json({
      success: true,
      message: 'Sessão finalizada localmente.',
    });
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }
}
