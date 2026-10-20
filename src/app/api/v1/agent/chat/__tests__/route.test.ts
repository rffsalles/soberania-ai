import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgendaStatus, AgendaType } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

vi.mock('@/lib/auth/request-user', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/request-user')>()),
  requireUser: vi.fn(async () => ({
    id: 'u1',
    name: 'Aluna Teste',
    email: 'aluna@example.com',
    role: 'STUDENT',
    classId: 'c1',
  })),
}));

const getAgendaForUser = vi.fn();
vi.mock('@/domains/agendas/services/agenda-service', () => ({
  getAgendaForUser: (...args: unknown[]) => getAgendaForUser(...args),
}));
const createInteraction = vi.fn(async (..._args: unknown[]) => ({ id: 'int1' }));
vi.mock('@/domains/pedagogy/services/interaction-repository', () => ({
  createInteraction: (...args: unknown[]) => createInteraction(...args),
}));
const createInferenceLog = vi.fn(async (..._args: unknown[]) => ({ id: 'log1' }));
vi.mock('@/domains/telemetry/services/inference-log-repository', () => ({
  createInferenceLog: (...args: unknown[]) => createInferenceLog(...args),
}));

import { POST } from '../route';
import { POST as STREAM_POST } from '../stream/route';

function agendaOf(type: AgendaType) {
  const now = Date.now();
  return {
    id: 'ag1',
    title: 'Aula',
    subject: 'BD',
    type,
    status: AgendaStatus.LIVE,
    startTime: new Date(now - 3600_000).toISOString(),
    endTime: new Date(now + 3600_000).toISOString(),
    classId: 'c1',
    className: 'T',
    teacherName: 'P',
  };
}

function chatRequest(body: unknown, path = 'chat') {
  return new Request(`http://localhost/api/v1/agent/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  getAgendaForUser.mockReset();
  createInteraction.mockClear();
  createInferenceLog.mockClear();
});

describe('POST /api/v1/agent/chat', () => {
  it('bloqueia pedido de gabarito em agenda EXAM', async () => {
    getAgendaForUser.mockResolvedValue(agendaOf(AgendaType.EXAM));
    const res = await POST(chatRequest({ agendaId: 'ag1', message: 'qual é a resposta da questão 2?' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.blockedByExamGuardrail).toBe(true);
    expect(data.interactionId).toBe('int1');
  });

  it('responde e grava interação e log em agenda CLASSROOM', async () => {
    getAgendaForUser.mockResolvedValue(agendaOf(AgendaType.CLASSROOM));
    const res = await POST(chatRequest({ agendaId: 'ag1', message: 'explique join' }));
    const data = await res.json();
    expect(data.blockedByExamGuardrail).toBe(false);
    expect(data.fallback).toBe(true);
    expect(createInteraction).toHaveBeenCalledTimes(1);
    expect(createInferenceLog).toHaveBeenCalledTimes(1);
  });

  it('rejeita payload sem agendaId', async () => {
    const res = await POST(chatRequest({ message: 'oi' }));
    expect(res.status).toBe(400);
  });

  it('retorna 404 para agenda fora do escopo', async () => {
    getAgendaForUser.mockRejectedValue(new DomainError(404, 'Agenda não encontrada.'));
    const res = await POST(chatRequest({ agendaId: 'x', message: 'oi' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/agent/chat/stream', () => {
  it('emite eventos token e um done final com o ChatResult', async () => {
    getAgendaForUser.mockResolvedValue(agendaOf(AgendaType.CLASSROOM));
    const res = await STREAM_POST(chatRequest({ agendaId: 'ag1', message: 'explique join' }, 'chat/stream'));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: token\ndata: {"token":');
    const done = text.split('event: done\ndata: ')[1]!;
    const result = JSON.parse(done.trim());
    expect(result.interactionId).toBe('int1');
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it('erros antes do stream saem como JSON via apiError', async () => {
    getAgendaForUser.mockRejectedValue(new DomainError(404, 'Agenda não encontrada.'));
    const res = await STREAM_POST(chatRequest({ agendaId: 'x', message: 'oi' }, 'chat/stream'));
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });
});
