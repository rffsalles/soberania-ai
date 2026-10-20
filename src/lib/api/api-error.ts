import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth/request-user';
import { DomainError } from './domain-error';

function fail(status: number, error: string, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { success: false, error } : { success: false, error, details },
    { status }
  );
}

export function apiError(err: unknown): NextResponse {
  if (err instanceof AuthError) return fail(err.status, err.message);
  if (err instanceof ZodError) return fail(400, 'Dados inválidos', err.flatten());
  if (err instanceof DomainError) return fail(err.status, err.message);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return fail(409, 'Registro já existe');
    if (err.code === 'P2025') return fail(404, 'Registro não encontrado');
    if (err.code === 'P2003') return fail(400, 'Referência inválida: registro relacionado não existe.');
  }
  console.error('[api] unhandled error', err);
  return fail(500, 'Erro interno do servidor');
}
