import { describe, it, expect } from 'vitest';
import { createTeacherSchema, upsertSubjectSchema } from '../admin.validator';

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
