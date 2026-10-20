import { Role, User } from '@prisma/client';
import { db } from '@/lib/db';
import type { AuthenticatedUser } from '@/lib/auth/types';

export type UserProfile = Omit<AuthenticatedUser, 'sessionId'>;

export function findUserByIdentifier(identifier: string): Promise<User | null> {
  return db.user.findFirst({
    where: {
      OR: [{ enrollment: identifier }, { email: identifier.toLowerCase() }],
    },
  });
}

export function findUserByEmailOrEnrollment(email: string, enrollment: string): Promise<User | null> {
  return db.user.findFirst({
    where: { OR: [{ email }, { enrollment }] },
  });
}

export function findUserProfile(id: string): Promise<UserProfile | null> {
  return db.user.findUnique({
    where: { id },
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
}

export function createUser(data: {
  name: string;
  email: string;
  enrollment: string;
  passwordHash: string;
  role: Role;
}): Promise<User> {
  return db.user.create({ data });
}

export function setUserPasswordHash(id: string, passwordHash: string): Promise<User> {
  return db.user.update({ where: { id }, data: { passwordHash } });
}

export async function findUserNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}
