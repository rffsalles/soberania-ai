import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listMessages: vi.fn(),
  postMessage: vi.fn(),
  checkStalemate: vi.fn(),
  after: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/agendas/services/study-group-service', () => ({
  listMessages: mocks.listMessages,
  postMessage: mocks.postMessage,
  checkStalemate: mocks.checkStalemate,
}));

import { GET, POST } from '../route';

const user = { id: 's1', role: Role.STUDENT, classId: 'c1' };
const ctx = { params: Promise.resolve({ id: 'ag1' }) };

function get(query = '') {
  return GET(new Request(`http://x/api/v1/agendas/ag1/messages${query}`), ctx);
}

function post(body: unknown) {
  return POST(
    new Request('http://x/api/v1/agendas/ag1/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    ctx
  );
}

let captured: Array<() => unknown> = [];

beforeEach(() => {
  vi.clearAllMocks();
  captured = [];
  mocks.requireUser.mockResolvedValue(user);
  mocks.listMessages.mockResolvedValue([{ id: 'm1', content: 'oi' }]);
  mocks.checkStalemate.mockResolvedValue(undefined);
  // Captura o callback e só o executa quando o teste chamar, como o after() real.
  mocks.after.mockImplementation((cb: () => unknown) => {
    captured.push(cb);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/agendas/:id/messages: verificação de silêncio', () => {
  it('responde 200 com as mensagens e agenda checkStalemate via after()', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, messages: [{ id: 'm1', content: 'oi' }] });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.checkStalemate).not.toHaveBeenCalled();
  });

  it('checkStalemate só roda quando o callback de after() é executado', async () => {
    await get();
    expect(mocks.checkStalemate).not.toHaveBeenCalled();
    await captured[0]();
    expect(mocks.checkStalemate).toHaveBeenCalledWith('ag1', user, expect.any(Date));
  });

  it('falha em checkStalemate dentro do callback vira console.warn e o callback resolve', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = new Error('llm fora');
    mocks.checkStalemate.mockRejectedValue(err);
    await get();
    await expect(captured[0]()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[study-group] falha ao verificar silêncio do grupo', err);
  });

  it('since inválido devolve 400 e não agenda nada', async () => {
    const res = await get('?since=xyz');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Parâmetro since inválido.');
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.listMessages).not.toHaveBeenCalled();
  });

  it('repassa since válido a listMessages', async () => {
    await get('?since=2026-11-08T10:00:00.000Z');
    expect(mocks.listMessages).toHaveBeenCalledWith(user, 'ag1', new Date('2026-11-08T10:00:00.000Z'));
  });

  it('DomainError do serviço vira o status correspondente', async () => {
    mocks.listMessages.mockRejectedValue(new DomainError(403, 'Sem acesso.'));
    const res = await get();
    expect(res.status).toBe(403);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/agendas/:id/messages', () => {
  it('mensagem válida devolve 200 com o retorno de postMessage e não agenda nada', async () => {
    const result = { message: { id: 'm2', content: 'olá' } };
    mocks.postMessage.mockResolvedValue(result);
    const res = await post({ content: 'olá' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, ...result });
    expect(mocks.postMessage).toHaveBeenCalledWith(user, 'ag1', 'olá');
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('corpo vazio devolve 400', async () => {
    const res = await post({ content: '   ' });
    expect(res.status).toBe(400);
    expect(mocks.postMessage).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
