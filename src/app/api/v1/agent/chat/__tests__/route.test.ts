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
const findLastInteraction = vi.fn(async (..._args: unknown[]) => null);
vi.mock('@/domains/pedagogy/services/interaction-repository', () => ({
  createInteraction: (...args: unknown[]) => createInteraction(...args),
  findLastInteraction: (...args: unknown[]) => findLastInteraction(...args),
}));
// A busca híbrida consulta o Postgres: isolada aqui para o teste não depender de banco.
vi.mock('@/domains/rag/hybrid-search', () => ({
  executeHybridSearch: vi.fn(async (q: { query: string }) => ({ query: q.query, chunks: [], latencyMs: 0 })),
}));
const createInferenceLog = vi.fn(async (..._args: unknown[]) => ({ id: 'log1' }));
vi.mock('@/domains/telemetry/services/inference-log-repository', () => ({
  createInferenceLog: (...args: unknown[]) => createInferenceLog(...args),
}));

import { TUTOR_UNAVAILABLE_MESSAGE } from '@/lib/constants/tutor';
import { aiProvider, type StreamChunk } from '@/lib/ai-provider';
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
  // Sem provedor real o gateway devolve o stream de fallback: o teste não depende do .env nem da rede.
  process.env.AI_PROVIDER = 'mock';

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

  it('bloqueia em EXAM quando a pergunta proibida vem num turno user do history', async () => {
    getAgendaForUser.mockResolvedValue(agendaOf(AgendaType.EXAM));
    const res = await POST(
      chatRequest({
        agendaId: 'ag1',
        message: 'pode repetir?',
        history: [
          { role: 'user', content: 'qual é a resposta da questão 2?' },
          { role: 'assistant', content: 'Claro, é a letra B.' },
        ],
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.blockedByExamGuardrail).toBe(true);
    expect(createInferenceLog).not.toHaveBeenCalled();
  });

  it('rejeita mensagem acima de 4000 caracteres com 400', async () => {
    const res = await POST(chatRequest({ agendaId: 'ag1', message: 'a'.repeat(4001) }));
    expect(res.status).toBe(400);
    expect(getAgendaForUser).not.toHaveBeenCalled();
  });

  it('rejeita history com mais de 20 turnos com 400', async () => {
    const history = Array.from({ length: 21 }, () => ({ role: 'user', content: 'oi' }));
    const res = await POST(chatRequest({ agendaId: 'ag1', message: 'oi', history }));
    expect(res.status).toBe(400);
  });

  it('rejeita turno do history acima de 4000 caracteres com 400', async () => {
    const history = [{ role: 'user', content: 'a'.repeat(4001) }];
    const res = await POST(chatRequest({ agendaId: 'ag1', message: 'oi', history }));
    expect(res.status).toBe(400);
  });

  it('com provedor mock responde indisponibilidade, grava só o log de inferência (CLASSROOM)', async () => {
    getAgendaForUser.mockResolvedValue(agendaOf(AgendaType.CLASSROOM));
    const res = await POST(chatRequest({ agendaId: 'ag1', message: 'explique join' }));
    const data = await res.json();
    expect(data.blockedByExamGuardrail).toBe(false);
    expect(data.fallback).toBe(true);
    expect(data.reply).toBe(TUTOR_UNAVAILABLE_MESSAGE);
    expect(createInteraction).not.toHaveBeenCalled();
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

/** Simula um provedor real: tokens sem a flag de fallback. */
function liveStream() {
  return vi.spyOn(aiProvider, 'streamChat').mockImplementation(async function* (): AsyncGenerator<StreamChunk> {
    yield { token: 'Qual a diferença ', isComplete: false };
    yield { token: 'entre INNER e LEFT JOIN?', isComplete: false };
    yield { token: '', isComplete: true };
  });
}

describe('POST /api/v1/agent/chat/stream', () => {
  it('emite eventos token e um done final com o ChatResult', async () => {
    const spy = liveStream();
    getAgendaForUser.mockResolvedValue(agendaOf(AgendaType.CLASSROOM));
    const res = await STREAM_POST(chatRequest({ agendaId: 'ag1', message: 'explique join' }, 'chat/stream'));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: token\ndata: {"token":');
    const done = text.split('event: done\ndata: ')[1]!;
    const result = JSON.parse(done.trim());
    expect(result.interactionId).toBe('int1');
    expect(result.reply.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('com provedor em fallback não emite tokens do texto de modelo, só o done com o aviso', async () => {
    getAgendaForUser.mockResolvedValue(agendaOf(AgendaType.CLASSROOM));
    const res = await STREAM_POST(chatRequest({ agendaId: 'ag1', message: 'explique join' }, 'chat/stream'));
    const text = await res.text();
    expect(text).not.toContain('event: token');
    const result = JSON.parse(text.split('event: done\ndata: ')[1]!.trim());
    expect(result).toMatchObject({ fallback: true, reply: TUTOR_UNAVAILABLE_MESSAGE, interactionId: null });
  });

  it('falha após o início do stream termina com frame error sem rejeitar o handler', async () => {
    const spy = liveStream();
    getAgendaForUser.mockResolvedValue(agendaOf(AgendaType.CLASSROOM));
    createInteraction.mockRejectedValueOnce(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await STREAM_POST(chatRequest({ agendaId: 'ag1', message: 'explique join' }, 'chat/stream'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: token');
    expect(text).toContain('event: error\ndata: {"error":');
    expect(text).not.toContain('event: done');
    errSpy.mockRestore();
    spy.mockRestore();
  });

  it('erros antes do stream saem como JSON via apiError', async () => {
    getAgendaForUser.mockRejectedValue(new DomainError(404, 'Agenda não encontrada.'));
    const res = await STREAM_POST(chatRequest({ agendaId: 'x', message: 'oi' }, 'chat/stream'));
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });
});
