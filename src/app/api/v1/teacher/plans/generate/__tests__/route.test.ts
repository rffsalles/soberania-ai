import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOfferingContext: vi.fn(),
  generatePlanSuggestion: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/academic/services/subject-service', () => ({ getOfferingContext: mocks.getOfferingContext }));
vi.mock('@/domains/teaching/services/plan-generation-service', () => ({
  generatePlanSuggestion: mocks.generatePlanSuggestion,
}));

import { POST } from '../route';

const teacherUser = { id: 't1', role: Role.TEACHER, classId: null };
const ctx = {
  subjectName: 'Banco de Dados I',
  courseName: 'Análise e Desenvolvimento de Sistemas',
  academicPeriod: '1º Semestre / 2026 (2026.1)',
  workloadHours: 80,
};
const refs = [{ id: 'm1', title: 'Sistemas de Banco de Dados', author: 'Elmasri' }];

function req(body: unknown) {
  return new Request('http://x/api/v1/teacher/plans/generate', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/v1/teacher/plans/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacherUser);
  });

  it('exige subjectId', async () => {
    const res = await POST(req({ selectedReferences: refs }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'Selecione a oferta para gerar.' });
    expect(mocks.getOfferingContext).not.toHaveBeenCalled();
  });

  it('lê o contexto da oferta no servidor e repassa ao serviço', async () => {
    mocks.getOfferingContext.mockResolvedValue(ctx);
    mocks.generatePlanSuggestion.mockResolvedValue({ syllabus: 's' });
    const res = await POST(
      req({ subjectId: 's1', subjectName: 'ignorado', courseName: 'ignorado', selectedReferences: refs })
    );
    expect(await res.json()).toEqual({ success: true, data: { syllabus: 's' } });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.TEACHER, Role.ADMIN]);
    expect(mocks.getOfferingContext).toHaveBeenCalledWith('s1', teacherUser);
    expect(mocks.generatePlanSuggestion).toHaveBeenCalledWith({ ...ctx, references: refs });
  });

  it('propaga 403 de professor não alocado', async () => {
    mocks.getOfferingContext.mockRejectedValue(new DomainError(403, 'Você não está alocado a esta oferta.'));
    const res = await POST(req({ subjectId: 's1', selectedReferences: [] }));
    expect(res.status).toBe(403);
    expect(mocks.generatePlanSuggestion).not.toHaveBeenCalled();
  });
});
