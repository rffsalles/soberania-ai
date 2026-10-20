import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/request-user', () => ({
  requireUser: vi.fn(async () => ({
    id: 'u1',
    name: 'Aluna Teste',
    email: 'aluna@example.com',
    role: 'STUDENT',
  })),
}));

import { POST } from '../route';

function chatRequest(body: unknown) {
  return new Request('http://localhost/api/v1/agent/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/v1/agent/chat', () => {
  it('bloqueia pedido de gabarito no payload enviado pela tela de prova', async () => {
    const res = await POST(
      chatRequest({ message: 'qual é a resposta da questão 2?', agendaType: 'EXAM' })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.blockedByExamGuardrail).toBe(true);
  });

  it('rejeita payload sem agendaType (sem fallback para CLASSROOM)', async () => {
    const res = await POST(chatRequest({ message: 'qual é a resposta da questão 2?' }));
    expect(res.status).toBe(400);
  });
});
