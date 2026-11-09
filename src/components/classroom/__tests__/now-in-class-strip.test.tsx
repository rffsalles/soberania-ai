// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StudentView } from '@/domains/classroom/class-state';
import { NowInClassStrip, continueInChatText } from '../now-in-class-strip';

afterEach(cleanup);

const empty: StudentView = { stepIndex: 1, activity: 'INNER JOIN e LEFT JOIN na prática', card: null, question: null, answer: null };
const mc = {
  seq: 4,
  kind: 'MULTIPLE_CHOICE' as const,
  enunciation: 'Qual JOIN mantém todas as linhas da esquerda?',
  options: [
    { key: 'A', text: 'INNER' },
    { key: 'B', text: 'LEFT' },
    { key: 'C', text: 'CROSS' },
    { key: 'D', text: 'SELF' },
  ],
};
const card = {
  concepts: [
    { title: 'LEFT JOIN', explanation: 'Mantém a esquerda.', citation: { chunkId: 'c1', label: 'Livro SQL', page: 58 } },
    { title: 'INNER JOIN', explanation: 'Só o casamento.', citation: { chunkId: 'c2', label: 'Apostila', page: null } },
  ],
  objectiveLink: 'Isso ajuda a ligar tabelas.',
  source: 'GENERATED' as const,
};

function renderStrip(view: StudentView, over: Partial<React.ComponentProps<typeof NowInClassStrip>> = {}) {
  const onAnswer = vi.fn();
  const onContinueInChat = vi.fn();
  render(
    <NowInClassStrip
      view={view}
      status="live"
      onAnswer={onAnswer}
      answerPending={false}
      answerError={null}
      onContinueInChat={onContinueInChat}
      {...over}
    />,
  );
  return { onAnswer, onContinueInChat };
}

describe('NowInClassStrip', () => {
  it('sem passo não renderiza nada', () => {
    const { container } = render(
      <NowInClassStrip view={{ ...empty, stepIndex: null }} status="live" onAnswer={vi.fn()} answerPending={false} answerError={null} onContinueInChat={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });
  it('mostra a activity e o indicador; sem activity usa Passo N', () => {
    renderStrip(empty);
    expect(screen.getByTestId('now-in-class-strip').textContent).toContain('Agora na aula');
    expect(screen.getByText('INNER JOIN e LEFT JOIN na prática')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Ao vivo');
    cleanup();
    renderStrip({ ...empty, stepIndex: 2, activity: null }, { status: 'updating' });
    expect(screen.getByText('Passo 3')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Atualizando');
  });
  it('offline mostra Reconectando', () => {
    renderStrip({ ...empty, stepIndex: 0, activity: 'x' }, { status: 'offline' });
    expect(screen.getByRole('status').textContent).toContain('Reconectando');
  });
  it('mostra o cartão com fontes e página só quando existe', () => {
    renderStrip({ ...empty, card });
    const text = screen.getByTestId('now-in-class-strip').textContent ?? '';
    expect(text).toContain('Da tutora');
    expect(text).toContain('LEFT JOIN');
    expect(text).toContain('Fonte: Livro SQL · pág. 58');
    expect(text).toContain('Fonte: Apostila');
    expect(text).not.toContain('Apostila · pág.');
    expect(text).toContain('Isso ajuda a ligar tabelas.');
  });
  it('escolher B e Responder chama onAnswer; sem escolha o botão fica desabilitado', () => {
    const { onAnswer } = renderStrip({ ...empty, question: mc });
    expect(screen.getByText('Pergunta rápida (opcional)')).not.toBeNull();
    expect(screen.getByRole('radiogroup')).not.toBeNull();
    const btn = screen.getByRole('button', { name: 'Responder' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('B) LEFT'));
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onAnswer).toHaveBeenCalledWith(4, { optionKey: 'B' });
  });
  it('em voo mostra Enviando... desabilitado e o erro em alert', () => {
    renderStrip({ ...empty, question: mc }, { answerPending: true, answerError: { seq: 4, message: 'Falhou' } });
    const btn = screen.getByRole('button', { name: 'Enviando...' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Falhou');
  });
  it('erro de outra pergunta (seq diferente) não aparece', () => {
    renderStrip({ ...empty, question: mc }, { answerError: { seq: 2, message: 'Falhou' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('conceitos com título repetido renderizam os dois', () => {
    const dup = { ...card, concepts: [card.concepts[0], { ...card.concepts[0], citation: { ...card.concepts[0].citation, chunkId: 'c9' } }] };
    renderStrip({ ...empty, card: dup });
    expect(screen.getAllByText('LEFT JOIN')).toHaveLength(2);
  });
  it('erro mostra a resposta certa e a justificativa; Continuar no chat envia o texto exato', () => {
    const { onContinueInChat } = renderStrip({
      ...empty,
      question: mc,
      answer: { wasCorrect: false, correctKey: 'C', rationale: 'Porque sim.' },
    });
    const text = screen.getByTestId('now-in-class-strip').textContent ?? '';
    expect(text).toContain('Resposta certa: C.');
    expect(text).toContain('Porque sim.');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar no chat' }));
    expect(onContinueInChat).toHaveBeenCalledWith(
      'Sobre a pergunta "Qual JOIN mantém todas as linhas da esquerda?": a justificativa foi "Porque sim.". Pode me explicar melhor?',
    );
  });
  it('acerto mostra Você acertou.', () => {
    renderStrip({ ...empty, question: mc, answer: { wasCorrect: true, correctKey: 'B', rationale: null } });
    expect(screen.getByTestId('now-in-class-strip').textContent).toContain('Você acertou.');
  });
  it('pergunta aberta envia { text } e depois mostra Resposta registrada.', () => {
    const open = { seq: 7, kind: 'OPEN' as const, text: 'Por que usar LEFT JOIN?' };
    const { onAnswer } = renderStrip({ ...empty, question: open });
    fireEvent.change(screen.getByLabelText('Sua resposta'), { target: { value: 'Para manter linhas.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    expect(onAnswer).toHaveBeenCalledWith(7, { text: 'Para manter linhas.' });
    cleanup();
    renderStrip({ ...empty, question: open, answer: { wasCorrect: null, correctKey: null, rationale: null } });
    expect(screen.getByTestId('now-in-class-strip').textContent).toContain('Resposta registrada.');
  });
  it('alreadyAnswered mostra a frase e o resultado da resposta gravada', () => {
    renderStrip({
      ...empty,
      question: mc,
      answer: { wasCorrect: false, correctKey: 'B', rationale: 'Mantém a esquerda.', alreadyAnswered: true },
    });
    const text = screen.getByTestId('now-in-class-strip').textContent ?? '';
    expect(text).toContain('Você já respondeu esta pergunta.');
    expect(text).toContain('Resposta certa: B.');
    expect(text).toContain('Mantém a esquerda.');
  });
  it('alreadyAnswered em pergunta aberta mostra só a frase', () => {
    const open = { seq: 7, kind: 'OPEN' as const, text: 'Por quê?' };
    renderStrip({ ...empty, question: open, answer: { wasCorrect: null, correctKey: null, rationale: null, alreadyAnswered: true } });
    const text = screen.getByTestId('now-in-class-strip').textContent ?? '';
    expect(text).toContain('Você já respondeu esta pergunta.');
    expect(text).not.toContain('Resposta registrada.');
  });
  it('continueInChatText nas demais variantes', () => {
    expect(continueInChatText(mc, { wasCorrect: true, correctKey: 'B', rationale: null })).toBe(
      'Sobre a pergunta "Qual JOIN mantém todas as linhas da esquerda?": pode me ajudar a revisar?',
    );
    expect(continueInChatText({ seq: 7, kind: 'OPEN', text: 'Por quê?' }, { wasCorrect: null, correctKey: null, rationale: null })).toBe(
      'Sobre a pergunta "Por quê?": pode me ajudar a pensar na resposta?',
    );
  });
});
