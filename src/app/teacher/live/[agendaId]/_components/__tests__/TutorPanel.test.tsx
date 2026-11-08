// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TeacherTutorView } from '@/domains/classroom/class-state';
import { TutorPanel, pulseText } from '../TutorPanel';

afterEach(cleanup);

const base: TeacherTutorView = {
  stepIndex: 1,
  status: 'GENERATING',
  card: null,
  question: null,
  questionSeq: null,
  skipped: null,
  canPublishNow: false,
  nextStepIndex: null,
  nextStepMuted: false,
  lessonMuted: false,
  pulse: null,
};
const setup = (v: Partial<TeacherTutorView>, disabled = false) => {
  const onNote = vi.fn();
  render(<TutorPanel view={{ ...base, ...v }} nextActivity="Subqueries" disabled={disabled} onNote={onNote} />);
  return onNote;
};
const text = () => screen.getByRole('region', { name: 'Tutora' }).textContent ?? '';

describe('TutorPanel', () => {
  it('estados IDLE, MUTED e GENERATING', () => {
    setup({ status: 'IDLE', stepIndex: null });
    expect(text()).toContain('A tutora começa quando a aula for iniciada.');
    cleanup();
    setup({ status: 'MUTED' });
    expect(text()).toContain('Tutora em silêncio neste passo.');
    cleanup();
    setup({ status: 'GENERATING' });
    expect(text()).toContain('Gerando o conteúdo da tutora…');
  });

  it('cartão e pergunta de múltipla escolha com gabarito', () => {
    const c = (title: string) => ({
      title,
      explanation: 'e',
      citation: { chunkId: 'c', label: 'l', page: null },
    });
    setup({
      status: 'READY',
      card: { concepts: [c('JOIN'), c('Chave')], objectiveLink: 'o', source: 'GENERATED' },
      question: {
        kind: 'MULTIPLE_CHOICE',
        origin: 'TUTOR',
        source: 'GENERATED',
        question: { id: 'q', enunciation: 'Qual JOIN?', correctKey: 'B', options: [], topic: 't' },
      } as never,
    });
    const t = text();
    expect(t).toContain('Cartão publicado');
    expect(t).toContain('JOIN');
    expect(t).toContain('Pergunta publicada');
    expect(t).toContain('Qual JOIN?');
    expect(t).toContain('Resposta certa: B');
  });

  it('pergunta aberta, skip e pulso', () => {
    setup({
      status: 'READY',
      question: { kind: 'OPEN', text: 'Por quê?', origin: 'TEACHER' },
      skipped: { reason: 'NO_MATERIAL', kind: 'BOTH' },
      pulse: { seq: 3, stepIndex: 1, kind: 'OPEN', answered: 0, correct: null },
    });
    const t = text();
    expect(t).toContain('Pergunta do professor publicada');
    expect(t).toContain('Por quê?');
    expect(t).toContain('Pulso da turma');
    expect(t).toContain('Ninguém respondeu ainda.');
  });

  it('Publicar agora, Pular e interruptor chamam onNote', () => {
    const onNote = setup({ canPublishNow: true, nextStepIndex: 2 });
    expect(text()).toContain('Próximo passo: Subqueries');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar agora' }));
    expect(onNote).toHaveBeenLastCalledWith({
      type: 'TEACHER_NOTE',
      stepIndex: 1,
      payload: { tutor: 'PUBLISH_NOW', scope: 'STEP' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(onNote).toHaveBeenLastCalledWith({
      type: 'TEACHER_NOTE',
      stepIndex: 2,
      payload: { tutor: 'MUTE', scope: 'STEP' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Tutora em silêncio nesta aula' }));
    expect(onNote).toHaveBeenLastCalledWith({ type: 'TEACHER_NOTE', payload: { tutor: 'MUTE', scope: 'LESSON' } });
  });

  it('próximo silenciado troca o botão pelo aviso; lessonMuted esconde o bloco e alterna UNMUTE', () => {
    const onNote = setup({ nextStepIndex: 2, nextStepMuted: true });
    expect(text()).toContain('A tutora ficará em silêncio no próximo passo.');
    expect(screen.queryByRole('button', { name: 'Pular' })).toBeNull();
    cleanup();
    const n2 = setup({ nextStepIndex: 2, lessonMuted: true });
    expect(text()).not.toContain('Próximo passo');
    fireEvent.click(screen.getByRole('switch'));
    expect(n2).toHaveBeenLastCalledWith({ type: 'TEACHER_NOTE', payload: { tutor: 'UNMUTE', scope: 'LESSON' } });
    expect(onNote).not.toHaveBeenCalled();
  });

  it('disabled trava botões e interruptor', () => {
    setup({ canPublishNow: true, nextStepIndex: 2 }, true);
    expect((screen.getByRole('button', { name: 'Publicar agora' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Pular' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
  });

  it('pulseText', () => {
    expect(pulseText({ seq: 1, stepIndex: 0, kind: 'MULTIPLE_CHOICE', answered: 3, correct: 2 })).toBe(
      '3 respostas · 67% de acerto'
    );
    expect(pulseText({ seq: 1, stepIndex: 0, kind: 'MULTIPLE_CHOICE', answered: 1, correct: 1 })).toBe(
      '1 resposta · 100% de acerto'
    );
    expect(pulseText({ seq: 1, stepIndex: 0, kind: 'OPEN', answered: 1, correct: null })).toBe(
      '1 resposta (pergunta aberta, sem correção automática)'
    );
  });
});
