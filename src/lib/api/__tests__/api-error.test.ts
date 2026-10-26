import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { apiError } from '../api-error';
import { DomainError } from '../domain-error';
import { AuthError } from '@/lib/auth/request-user';

async function run(err: unknown) {
  const res = apiError(err);
  return { status: res.status, body: await res.json() };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 't' });
}

describe('apiError', () => {
  it('DomainError com details devolve details no corpo', async () => {
    const { status, body } = await run(new DomainError(409, 'x', [{ a: 1 }]));
    expect(status).toBe(409);
    expect(body).toEqual({ success: false, error: 'x', details: [{ a: 1 }] });
  });

  it('AuthError mantém o status', async () => {
    expect((await run(new AuthError(401, 'no'))).status).toBe(401);
    expect((await run(new AuthError(403, 'no'))).status).toBe(403);
  });

  it('SyntaxError de req.json() -> 400 JSON inválido', async () => {
    const err = await new Request('http://x', { method: 'POST', body: '{nope' }).json().catch((e: unknown) => e);
    const { status, body } = await run(err);
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: 'JSON inválido' });
  });

  it('ZodError -> 400 com details', async () => {
    const parsed = z.object({ a: z.string() }).safeParse({});
    if (parsed.success) throw new Error('unreachable');
    const { status, body } = await run(parsed.error);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.details).toBeDefined();
  });

  it('Prisma P2002 -> 409, P2025 -> 404', async () => {
    expect((await run(prismaError('P2002'))).status).toBe(409);
    expect((await run(prismaError('P2025'))).status).toBe(404);
  });

  it('Prisma P2003 -> 400 com mensagem de referência inválida', async () => {
    const { status, body } = await run(prismaError('P2003'));
    expect(status).toBe(400);
    expect(body.error).toBe('Referência inválida: registro relacionado não existe.');
  });

  it('DomainError usa seu status', async () => {
    const { status, body } = await run(new DomainError(422, 'inválido'));
    expect(status).toBe(422);
    expect(body.error).toBe('inválido');
  });

  it('desconhecido -> 500 sem vazar a mensagem', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { status, body } = await run(new Error('segredo'));
    expect(status).toBe(500);
    expect(body.error).not.toContain('segredo');
  });
});
