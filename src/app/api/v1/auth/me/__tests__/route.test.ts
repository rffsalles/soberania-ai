import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import { AUTH_COOKIE_NAME } from '@/lib/auth/rbac';

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), findClassContext: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/domains/academic/services/class-repository', () => ({ findClassContext: mocks.findClassContext }));

import { GET } from '../route';

const base = { name: 'Ana', email: 'ana@x', enrollment: null, avatarUrl: null, sessionId: 'se1' };
const ctx = { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, course: { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS' }, academicPeriod: { name: '1º Semestre / 2026 (2026.1)', code: '2026.1' } };
const withCookie = () => new NextRequest('http://x/api/v1/auth/me', { headers: { cookie: `${AUTH_COOKIE_NAME}=tok` } });

describe('/api/v1/auth/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aluno com turma recebe o contexto da turma', async () => {
    mocks.getSessionUser.mockResolvedValue({ ...base, id: 's1', role: Role.STUDENT, classId: 'c1' });
    mocks.findClassContext.mockResolvedValue(ctx);
    const body = await (await GET(withCookie())).json();
    expect(body.user).toMatchObject({ id: 's1', class: ctx });
    expect(mocks.findClassContext).toHaveBeenCalledWith('c1');
  });
  it('usuário sem turma recebe class null sem consultar o banco', async () => {
    mocks.getSessionUser.mockResolvedValue({ ...base, id: 't1', role: Role.TEACHER, classId: null });
    const body = await (await GET(withCookie())).json();
    expect(body.user.class).toBeNull();
    expect(mocks.findClassContext).not.toHaveBeenCalled();
  });
  it('sem cookie responde 401', async () => {
    expect((await GET(new NextRequest('http://x/api/v1/auth/me'))).status).toBe(401);
  });
});
