import { describe, it, expect } from 'vitest';
import { createTeacherSchema, upsertSubjectSchema, createClassSchema, updateClassSchema, updateSubjectSchema } from '../admin.validator';

const valid = {
  name: 'Carlos Silva',
  email: 'Carlos@Soberania.edu.br',
  enrollment: 'PROF002',
  password: '12345678',
};

describe('createTeacherSchema', () => {
  it('rejects password shorter than 8 chars', () => {
    expect(createTeacherSchema.safeParse({ ...valid, password: '1234567' }).success).toBe(false);
  });
  it('rejects missing password', () => {
    const { password: _p, ...rest } = valid;
    expect(createTeacherSchema.safeParse(rest).success).toBe(false);
  });
  it('rejects invalid email', () => {
    expect(createTeacherSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
  });
  it('lowercases email', () => {
    const r = createTeacherSchema.safeParse(valid);
    expect(r.success && r.data.email).toBe('carlos@soberania.edu.br');
  });
});

describe('upsertSubjectSchema', () => {
  const base = { name: 'Cálculo', code: 'MAT01', courseName: 'Engenharia' };
  it('applies defaults', () => {
    expect(upsertSubjectSchema.parse(base)).toMatchObject({
      academicLevel: 'HIGHER_EDUCATION',
      academicYear: 2026,
      teacherIds: [],
    });
  });
  it('coerces academicYear', () => {
    expect(upsertSubjectSchema.parse({ ...base, academicYear: '2027' }).academicYear).toBe(2027);
  });
  it('rejects short name', () => {
    expect(upsertSubjectSchema.safeParse({ ...base, name: 'a' }).success).toBe(false);
  });
  it('aceita classId cuid opcional ou null', () => {
    const classId = 'ckx1q2w3e0000abcdxyz12345';
    expect(upsertSubjectSchema.parse({ ...base, classId }).classId).toBe(classId);
    expect(upsertSubjectSchema.parse(base).classId).toBeUndefined();
    expect(upsertSubjectSchema.parse({ ...base, classId: null }).classId).toBeNull();
  });
  it('rejeita classId que não é cuid', () => {
    expect(upsertSubjectSchema.safeParse({ ...base, classId: 'turma 1' }).success).toBe(false);
  });
});

describe('createClassSchema', () => {
  const base = { name: '3º Semestre · ADS', code: 'ADS-2026-3A' };
  it('aplica padrões de ano atual e semestre 1', () => {
    expect(createClassSchema.parse(base)).toMatchObject({ year: new Date().getFullYear(), semester: 1 });
  });
  it('coage ano e semestre vindos como string', () => {
    expect(createClassSchema.parse({ ...base, year: '2027', semester: '3' })).toMatchObject({ year: 2027, semester: 3 });
  });
  it('remove espaços nas bordas de nome e código', () => {
    expect(createClassSchema.parse({ name: '  Turma A ', code: '  ADS-2026-3A ' })).toMatchObject({ name: 'Turma A', code: 'ADS-2026-3A' });
  });
  it('rejeita semestre fora de 1 a 4 e código curto', () => {
    expect(createClassSchema.safeParse({ ...base, semester: 5 }).success).toBe(false);
    expect(createClassSchema.safeParse({ ...base, semester: 0 }).success).toBe(false);
    expect(createClassSchema.safeParse({ ...base, code: 'A' }).success).toBe(false);
  });
  it('updateClassSchema exige id', () => {
    expect(updateClassSchema.safeParse(base).success).toBe(false);
    expect(updateClassSchema.safeParse({ ...base, id: 'c1' }).success).toBe(true);
  });
});

describe('updateSubjectSchema', () => {
  const base = { id: 's1', name: 'Cálculo', code: 'MAT01', courseName: 'Engenharia' };
  it('não preenche academicYear quando ausente (edição preserva o ano salvo)', () => {
    expect(updateSubjectSchema.parse(base).academicYear).toBeUndefined();
  });
  it('coage academicYear quando informado', () => {
    expect(updateSubjectSchema.parse({ ...base, academicYear: '2027' }).academicYear).toBe(2027);
  });
});

describe('createClassSchema (mensagens do ano)', () => {
  it('rejeita ano fora do intervalo com mensagem em pt-BR', () => {
    const r = createClassSchema.safeParse({ name: 'Turma A', code: 'ADS-2026-3A', year: 2019 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Informe um ano entre 2020 e 2050');
  });
});
