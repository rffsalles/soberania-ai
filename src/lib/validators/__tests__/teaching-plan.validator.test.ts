import { describe, it, expect } from 'vitest';
import { createTeachingPlanSchema, updateTeachingPlanSchema } from '../teaching-plan.validator';

describe('updateTeachingPlanSchema', () => {
  it('descarta subjectId e academicPeriodId', () => {
    expect(updateTeachingPlanSchema.parse({ subjectId: 's2', academicPeriodId: 'ap1', syllabus: 'x' })).toEqual({ syllabus: 'x' });
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
    expect(createTeachingPlanSchema.safeParse({ subjectId: 's1', syllabus: 'x', totalHours: null, theoryHours: '60', practiceHours: 20 }).success).toBe(true);
  });
});
