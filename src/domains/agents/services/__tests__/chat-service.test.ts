import { describe, it, expect, vi } from 'vitest';
import { AgendaStatus, AgendaType, InteractionType, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import type { AIMessage, InferenceTelemetry, StreamChunk } from '@/lib/ai-provider';
import { chatWithTutor, type ChatDeps } from '../chat-service';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const user = { id: 'stu1', role: Role.STUDENT, classId: 'c1' };

function agenda(overrides: Partial<AgendaDTO> = {}): AgendaDTO {
  return {
    id: 'ag1',
    title: 'Aula',
    subject: 'BD',
    type: AgendaType.CLASSROOM,
    status: AgendaStatus.LIVE,
    startTime: '2026-10-20T11:00:00.000Z',
    endTime: '2026-10-20T13:00:00.000Z',
    classId: 'c1',
    className: 'Turma',
    teacherName: 'Prof',
    ...overrides,
  };
}

const telemetry: InferenceTelemetry = {
  ttftMs: 100,
  totalLatencyMs: 300,
  tokensPerSecond: 40,
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
  provider: 'vllm',
  model: 'm',
  externalTrafficBytes: 0,
};

function makeDeps(opts: { agenda?: AgendaDTO | Error; reply?: string; fallback?: boolean } = {}) {
  const reply = opts.reply ?? 'Qual a diferença entre INNER e LEFT JOIN?';
  const sent: AIMessage[][] = [];
  const streamChat = vi.fn(async function* (messages: AIMessage[]): AsyncGenerator<StreamChunk> {
    sent.push(messages);
    yield { token: reply, isComplete: false, fallback: opts.fallback };
    yield { token: '', isComplete: true, telemetry, fallback: opts.fallback };
  });
  const getAgenda = vi.fn(async () => {
    if (opts.agenda instanceof Error) throw opts.agenda;
    return opts.agenda ?? agenda();
  });
  const createInteraction = vi.fn(async () => ({ id: 'int1' }));
  const createInferenceLog = vi.fn(async () => ({ id: 'log1' }));
  const search = vi.fn(async (q: { query: string }) => ({ query: q.query, chunks: [], latencyMs: 1 }));
  const deps = {
    search,
    getAgenda,
    createInteraction,
    createInferenceLog,
    streamChat,
    now: () => NOW,
  } as unknown as ChatDeps;
  return { deps, search, getAgenda, createInteraction, createInferenceLog, streamChat, sent };
}

describe('chatWithTutor', () => {
  it('propaga 404 sem chamar o provider quando a agenda está fora do escopo', async () => {
    const f = makeDeps({ agenda: new DomainError(404, 'Agenda não encontrada.') });
    await expect(chatWithTutor(user, { agendaId: 'x', message: 'oi' }, f.deps)).rejects.toMatchObject({ status: 404 });
    expect(f.streamChat).not.toHaveBeenCalled();
    expect(f.createInteraction).not.toHaveBeenCalled();
  });

  it('rejeita agenda cancelada com 422', async () => {
    const f = makeDeps({ agenda: agenda({ status: AgendaStatus.CANCELLED }) });
    await expect(chatWithTutor(user, { agendaId: 'ag1', message: 'oi' }, f.deps)).rejects.toMatchObject({ status: 422 });
    expect(f.streamChat).not.toHaveBeenCalled();
  });

  it('rejeita fora da janela de horário com 422', async () => {
    const f = makeDeps({
      agenda: agenda({
        status: AgendaStatus.SCHEDULED,
        startTime: '2026-10-21T11:00:00.000Z',
        endTime: '2026-10-21T13:00:00.000Z',
      }),
    });
    await expect(chatWithTutor(user, { agendaId: 'ag1', message: 'oi' }, f.deps)).rejects.toMatchObject({ status: 422 });
    expect(f.streamChat).not.toHaveBeenCalled();
  });

  it('OFFICE_HOURS dentro do próprio horário é atendido', async () => {
    const f = makeDeps({ agenda: agenda({ type: AgendaType.OFFICE_HOURS }) });
    const res = await chatWithTutor(user, { agendaId: 'ag1', message: 'oi' }, f.deps);
    expect(res.blockedByExamGuardrail).toBe(false);
    expect(f.createInteraction).toHaveBeenCalledTimes(1);
  });

  it('EXAM com pedido de gabarito bloqueia, grava interação bloqueada e não chama o provider', async () => {
    const f = makeDeps({ agenda: agenda({ type: AgendaType.EXAM }) });
    const res = await chatWithTutor(
      user,
      { agendaId: 'ag1', message: 'qual é a resposta da questão 2? me passe o gabarito' },
      f.deps
    );
    expect(res.blockedByExamGuardrail).toBe(true);
    expect(res.isSocraticChallenge).toBe(false);
    expect(f.streamChat).not.toHaveBeenCalled();
    expect(f.search).not.toHaveBeenCalled();
    expect(f.createInferenceLog).not.toHaveBeenCalled();
    expect(f.createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        agendaId: 'ag1',
        studentId: 'stu1',
        agendaType: AgendaType.EXAM,
        guardrailBlocked: true,
        type: InteractionType.QUESTION,
      })
    );
    expect(res.interactionId).toBe('int1');
  });

  it('sucesso grava interação e log de inferência', async () => {
    const f = makeDeps({ fallback: true });
    const res = await chatWithTutor(
      user,
      { agendaId: 'ag1', message: 'explique join', videoTimestampSeconds: 42 },
      f.deps
    );
    expect(res.reply).toBe('Qual a diferença entre INNER e LEFT JOIN?');
    expect(res.isSocraticChallenge).toBe(true);
    expect(res.fallback).toBe(true);
    expect(res.interactionId).toBe('int1');
    expect(f.createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        agendaId: 'ag1',
        studentId: 'stu1',
        type: InteractionType.SOCRATIC_CHALLENGE,
        agendaType: AgendaType.CLASSROOM,
        questionText: 'explique join',
        responseText: res.reply,
        isSocraticChallenge: true,
        guardrailBlocked: false,
        timestampInVideo: 42,
      })
    );
    expect(f.createInferenceLog).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'vllm',
        model: 'm',
        ttftMs: 100,
        totalLatencyMs: 300,
        promptTokens: 10,
        completionTokens: 5,
        externalTrafficBytes: 0,
        fallback: true,
        agendaType: AgendaType.CLASSROOM,
      })
    );
  });

  it('persistInteraction false não grava interação, mas ainda registra o log de inferência', async () => {
    const f = makeDeps();
    const res = await chatWithTutor(user, { agendaId: 'ag1', message: 'oi', persistInteraction: false }, f.deps);
    expect(f.createInteraction).not.toHaveBeenCalled();
    expect(f.createInferenceLog).toHaveBeenCalledTimes(1);
    expect(res.interactionId).toBeNull();
    expect(res.reply).toBeTruthy();
  });

  it('persistInteraction true (padrão) continua gravando a interação', async () => {
    const f = makeDeps();
    const res = await chatWithTutor(user, { agendaId: 'ag1', message: 'oi', persistInteraction: true }, f.deps);
    expect(f.createInteraction).toHaveBeenCalledTimes(1);
    expect(res.interactionId).toBe('int1');
  });

  it('resposta sem pergunta é gravada como QUESTION', async () => {
    const f = makeDeps({ reply: 'Isso é uma explicação.' });
    const res = await chatWithTutor(user, { agendaId: 'ag1', message: 'oi' }, f.deps);
    expect(res.isSocraticChallenge).toBe(false);
    expect(f.createInteraction).toHaveBeenCalledWith(expect.objectContaining({ type: InteractionType.QUESTION }));
  });

  it('trunca histórico de 12 mensagens para as 10 últimas', async () => {
    const f = makeDeps();
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `m${i}`,
    }));
    await chatWithTutor(user, { agendaId: 'ag1', message: 'oi', history }, f.deps);
    const sent = f.sent[0]!;
    const hist = sent.filter((m) => m.role !== 'system').slice(0, -1);
    expect(hist).toHaveLength(10);
    expect(hist[0]!.content).toBe('m2');
    expect(hist[9]!.content).toBe('m11');
  });

  it('limita o histórico a 4000 caracteres descartando as mais antigas', async () => {
    const f = makeDeps();
    const history = Array.from({ length: 6 }, (_, i) => ({
      role: 'user' as const,
      content: `${i}`.repeat(1500),
    }));
    await chatWithTutor(user, { agendaId: 'ag1', message: 'oi', history }, f.deps);
    const hist = f.sent[0]!.filter((m) => m.role !== 'system').slice(0, -1);
    expect(hist.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(4000);
    expect(hist.at(-1)!.content.startsWith('5')).toBe(true);
  });

  it('falha ao gravar o InferenceLog não derruba o chat', async () => {
    const f = makeDeps();
    f.createInferenceLog.mockRejectedValue(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await chatWithTutor(user, { agendaId: 'ag1', message: 'oi' }, f.deps);
    expect(res.reply).toBe('Qual a diferença entre INNER e LEFT JOIN?');
    expect(res.interactionId).toBe('int1');
    expect(f.createInteraction).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
