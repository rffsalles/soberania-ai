import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

/** Teachers may only touch resources of their own plans; admins may touch any. */
export function assertOwner(user: { id: string; role: Role }, teacherId: string) {
  if (user.role === Role.TEACHER && teacherId !== user.id) {
    throw new DomainError(403, 'Você não tem acesso a este recurso.');
  }
}
