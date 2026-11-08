import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), answerTutorQuestion: vi.fn() }));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/classroom/class-answer-service', () => ({ answerTutorQuestion: mocks.answerTutorQuestion }));

import { POST } from '../route';

const user = { id: 's1', role: Role.STUDENT, classId: 'c1' };

function post(seq: string, body: unknown) {
  return POST(
    new Request(`http://x/api/v1/agendas/ag1/events/${seq}/answer`, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'ag1', seq }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
});

describe('POST /api/v1/agendas/:id/events/:seq/answer', () => {
  it('repassa o corpo e devolve 201 com o resultado', async () => {
    const result = { wasCorrect: true, correctKey: 'B', rationale: 'ok' };
    mocks.answerTutorQuestion.mockResolvedValue(result);
    const res = await post('4', { optionKey: 'B', videoSeconds: 7 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, result });
    expect(mocks.answerTutorQuestion).toHaveBeenCalledWith(user, 'ag1', 4, { optionKey: 'B', videoSeconds: 7 });
  });

  it.each(['abc', '0', '-1', '1.5'])('seq %s vira 404', async (seq) => {
    const res = await post(seq, { optionKey: 'B' });
    expect(res.status).toBe(404);
    expect(mocks.answerTutorQuestion).not.toHaveBeenCalled();
  });

  it('corpo inválido vira 400', async () => {
    const res = await post('4', { videoSeconds: -3 });
    expect(res.status).toBe(400);
  });

  it('409 traz details.code', async () => {
    mocks.answerTutorQuestion.mockRejectedValue(
      new DomainError(409, 'Você já respondeu esta pergunta.', { code: 'ALREADY_ANSWERED' }),
    );
    const res = await post('4', { optionKey: 'B' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Você já respondeu esta pergunta.',
      details: { code: 'ALREADY_ANSWERED' },
    });
  });

  it('403 para não aluno vem do serviço', async () => {
    mocks.answerTutorQuestion.mockRejectedValue(new DomainError(403, 'Apenas alunos respondem às perguntas da tutora.'));
    expect((await post('4', { optionKey: 'B' })).status).toBe(403);
  });

  it('400 INVALID_ANSWER do serviço', async () => {
    mocks.answerTutorQuestion.mockRejectedValue(
      new DomainError(400, 'Escolha uma das alternativas.', { code: 'INVALID_ANSWER' }),
    );
    const res = await post('4', { optionKey: 'E' });
    expect(res.status).toBe(400);
    expect((await res.json()).details.code).toBe('INVALID_ANSWER');
  });
});
