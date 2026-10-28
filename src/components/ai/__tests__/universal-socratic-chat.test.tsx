// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { API_ROUTES } from '@/lib/constants/routes';

import { UniversalSocraticChat } from '../universal-socratic-chat';

const items = [
  { id: 'i1', question: 'O que é SQL?', answer: 'Uma linguagem.', citation: '[Livro X · pág. 3]', guardrailBlocked: false, createdAt: '2026-10-20T13:00:00.000Z' },
  { id: 'i2', question: 'E JOIN?', answer: 'Combina tabelas.', citation: null, guardrailBlocked: false, createdAt: '2026-10-20T13:05:00.000Z' },
];

describe('UniversalSocraticChat histórico', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('restaura saudação + pares pergunta/resposta em ordem', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ items }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<UniversalSocraticChat agendaId="ag1" agendaType="CLASSROOM" />);
    await screen.findByText('O que é SQL?');
    expect(fetchMock.mock.calls[0][0]).toBe(API_ROUTES.AGENDA_INTERACTIONS('ag1'));
    const text = container.textContent ?? '';
    const order = ['Sou a Tutora Lucy', 'O que é SQL?', 'Uma linguagem.', 'E JOIN?', 'Combina tabelas.'].map((t) => text.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('falha no fetch mostra só a saudação', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<UniversalSocraticChat agendaId="ag1" agendaType="CLASSROOM" />);
    await waitFor(() => expect(screen.getByText(/Sou a Tutora Lucy/)).toBeTruthy());
    expect(screen.queryByText('O que é SQL?')).toBeNull();
  });

  it('item de ontem mostra o timestamp com dd/MM', async () => {
    const createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const old = [{ ...items[0], id: 'old', question: 'Pergunta antiga', createdAt }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: old }), { status: 200 })));
    const { container } = render(<UniversalSocraticChat agendaId="ag1" agendaType="CLASSROOM" />);
    await screen.findByText('Pergunta antiga');
    expect(container.textContent ?? '').toMatch(/\d{2}\/\d{2} \d{2}:\d{2}/);
  });
});
