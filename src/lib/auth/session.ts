import { db } from '@/lib/db';
import { signAuthToken, verifyAuthToken } from './token';
import { AuthenticatedUser } from './types';

const SESSION_DURATION_DAYS = 7;

/**
 * Cria uma nova sessão com registro físico no banco de dados e gera o token JWT assinado.
 */
export async function createSession(
  userId: string,
  metadata?: { ip?: string; userAgent?: string }
): Promise<{ token: string; user: AuthenticatedUser } | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      enrollment: true,
      avatarUrl: true,
      classId: true,
    },
  });

  if (!user) return null;

  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  const session = await db.session.create({
    data: {
      userId: user.id,
      sessionToken,
      expiresAt,
      ipAddress: metadata?.ip || null,
      userAgent: metadata?.userAgent || null,
    },
  });

  const authUser: AuthenticatedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    enrollment: user.enrollment,
    avatarUrl: user.avatarUrl,
    classId: user.classId,
    sessionId: session.id,
  };

  const token = await signAuthToken({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    enrollment: user.enrollment,
    sessionId: session.id,
  });

  return { token, user: authUser };
}

/**
 * Revoga ativamente uma sessão no banco de dados.
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
  try {
    await db.session.updateMany({
      where: {
        OR: [{ id: sessionId }, { sessionToken: sessionId }],
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica se a sessão está ativa e não foi revogada no PostgreSQL.
 */
export async function isSessionActive(sessionId: string): Promise<boolean> {
  try {
    const session = await db.session.findFirst({
      where: {
        OR: [{ id: sessionId }, { sessionToken: sessionId }],
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return !!session;
  } catch {
    return false;
  }
}

/**
 * Valida o token JWT e confirma a revogação no banco para endpoints de backend.
 */
export async function getSessionUser(token: string): Promise<AuthenticatedUser | null> {
  const payload = await verifyAuthToken(token);
  if (!payload || !payload.sessionId) return null;

  // Validação ativa no banco (revogação instantânea)
  const active = await isSessionActive(payload.sessionId);
  if (!active) return null;

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      enrollment: true,
      avatarUrl: true,
      classId: true,
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    enrollment: user.enrollment,
    avatarUrl: user.avatarUrl,
    classId: user.classId,
    sessionId: payload.sessionId,
  };
}
