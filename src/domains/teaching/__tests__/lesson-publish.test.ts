import { describe, it, expect } from 'vitest';
import { publishBlockReason, lessonReadiness } from '../lesson-publish';

const STEP = { timeSeconds: 0, timeRange: '00:00-10:00', activity: 'Abertura', description: 'Descrição' };
const base = { classNumber: 3, topicTitle: 'Aula 3', dailyObjective: '', timeScript: [] as unknown[] };

describe('publishBlockReason', () => {
  it('aula vazia: bloqueia pelo título', () => {
    expect(publishBlockReason(base)).toBe('Defina um título diferente de "Aula N".');
  });
  it('título próprio e objetivo vazio: bloqueia pelo objetivo', () => {
    expect(publishBlockReason({ ...base, topicTitle: 'Modelagem' })).toBe('Preencha o objetivo da aula.');
  });
  it('título e objetivo sem roteiro: bloqueia pelo roteiro', () => {
    expect(publishBlockReason({ ...base, topicTitle: 'Modelagem', dailyObjective: 'Obj' })).toBe(
      'Adicione ao menos uma etapa ao roteiro.',
    );
  });
  it('aula completa: sem bloqueio', () => {
    expect(publishBlockReason({ ...base, topicTitle: 'Modelagem', dailyObjective: 'Obj', timeScript: [STEP] })).toBeNull();
  });
});

describe('lessonReadiness', () => {
  it('aula vazia não está pronta e traz o motivo', () => {
    expect(lessonReadiness(base)).toEqual({ ready: false, reason: 'Defina um título diferente de "Aula N".' });
  });
  it('objetivo vazio não está pronta', () => {
    expect(lessonReadiness({ ...base, topicTitle: 'Modelagem' })).toEqual({
      ready: false,
      reason: 'Preencha o objetivo da aula.',
    });
  });
  it('roteiro vazio não está pronta', () => {
    expect(lessonReadiness({ ...base, topicTitle: 'Modelagem', dailyObjective: 'Obj' })).toEqual({
      ready: false,
      reason: 'Adicione ao menos uma etapa ao roteiro.',
    });
  });
  it('aula completa está pronta', () => {
    expect(
      lessonReadiness({ ...base, topicTitle: 'Modelagem', dailyObjective: 'Obj', timeScript: [STEP] }),
    ).toEqual({ ready: true, reason: null });
  });
});
