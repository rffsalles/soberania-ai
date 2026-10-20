import type { Session } from '@prisma/client';
import { db } from '@/lib/db';

export function createSession(
  userId: string,
  meta: { sessionToken: string; expiresAt: Date; ip?: string; userAgent?: string }
): Promise<Session> {
  return db.session.create({
    data: {
      userId,
      sessionToken: meta.sessionToken,
      expiresAt: meta.expiresAt,
      ipAddress: meta.ip || null,
      userAgent: meta.userAgent || null,
    },
  });
}

/** Revoga sessões ativas por id ou token; retorna quantas foram revogadas. */
export async function revokeSession(idOrToken: string): Promise<number> {
  const result = await db.session.updateMany({
    where: { OR: [{ id: idOrToken }, { sessionToken: idOrToken }], revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export function findActiveSession(idOrToken: string): Promise<Session | null> {
  return db.session.findFirst({
    where: {
      OR: [{ id: idOrToken }, { sessionToken: idOrToken }],
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}
