import { describe, it, expect } from 'vitest';
import { createTeachingPlanSchema, updateTeachingPlanSchema } from '../teaching-plan.validator';

describe('updateTeachingPlanSchema', () => {
  it('descarta subjectId e academicPeriodId', () => {
    expect(updateTeachingPlanSchema.parse({ subjectId: 's2', academicPeriodId: 'ap1', syllabus: 'x' })).toEqual({ syllabus: 'x' });
  });
  it('descarta totalHours: a carga total vem da matriz', () => {
    expect(updateTeachingPlanSchema.parse({ syllabus: 'x', totalHours: 99, theoryHours: 40 })).toEqual({ syllabus: 'x', theoryHours: 40 });
  });
  it('unitsContent aceita unidades com chapterIds opcionais e rejeita título vazio, unitNumber 0 e tópico vazio', () => {
    const ok = (u: unknown) => updateTeachingPlanSchema.safeParse({ unitsContent: [u] }).success;
    expect(ok({ unitNumber: 1, title: 'Base', topics: ['Joins'], chapterIds: ['ch1'] })).toBe(true);
    expect(ok({ unitNumber: 1, title: 'Base', topics: [] })).toBe(true);
    expect(ok({ unitNumber: 1, title: '  ', topics: [] })).toBe(false);
    expect(ok({ unitNumber: 0, title: 'Base', topics: [] })).toBe(false);
    expect(ok({ unitNumber: 1, title: 'Base', topics: ['  '] })).toBe(false);
  });
  it('rejeita null em coluna obrigatória', () => {
    expect(updateTeachingPlanSchema.safeParse({ syllabus: null }).success).toBe(false);
  });
});

describe('createTeachingPlanSchema', () => {
  it('exige oferta e ementa com mensagens pt-BR', () => {
    expect(createTeachingPlanSchema.safeParse({ syllabus: 'x' }).error?.issues[0].message).toBe('Selecione a oferta');
    expect(createTeachingPlanSchema.safeParse({ subjectId: 's1' }).error?.issues[0].message).toBe('Informe a ementa');
    expect(createTeachingPlanSchema.safeParse({ subjectId: 's1', syllabus: '' }).error?.issues[0].message).toBe('Informe a ementa');
  });
  it('descarta academicPeriodId', () => {
    expect(createTeachingPlanSchema.parse({ subjectId: 's1', syllabus: 'x', academicPeriodId: 'ap1' })).not.toHaveProperty('academicPeriodId');
  });
  it('deixa horas null ou string para o serviço validar', () => {
    expect(createTeachingPlanSchema.safeParse({ subjectId: 's1', syllabus: 'x', theoryHours: '60', practiceHours: null }).success).toBe(true);
  });
  it('descarta totalHours enviado pelo cliente', () => {
    const parsed = createTeachingPlanSchema.parse({ subjectId: 's1', syllabus: 'x', totalHours: 99, theoryHours: 60, practiceHours: 20 });
    expect(parsed).not.toHaveProperty('totalHours');
    expect(parsed).toMatchObject({ theoryHours: 60, practiceHours: 20 });
  });
});
