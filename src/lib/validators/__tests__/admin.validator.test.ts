import { describe, it, expect } from 'vitest';
import { createTeacherSchema, upsertSubjectSchema, createClassSchema, updateClassSchema, updateSubjectSchema, createCourseSchema, updateCourseSchema, createDisciplineSchema, updateDisciplineSchema } from '../admin.validator';

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

describe('createCourseSchema', () => {
  it('aplica nível HIGHER_EDUCATION por padrão e remove espaços', () => {
    expect(createCourseSchema.parse({ name: '  Ensino Médio ', code: ' EM ' })).toEqual({
      name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGHER_EDUCATION',
    });
  });
  it('rejeita nível desconhecido e nome curto com mensagem pt-BR', () => {
    expect(createCourseSchema.safeParse({ name: 'ADS', code: 'ADS', academicLevel: 'MBA' }).success).toBe(false);
    expect(createCourseSchema.safeParse({ name: 'A', code: 'ADS' }).error?.issues[0].message).toBe('Informe o nome do curso');
  });
  it('usa mensagens pt-BR quando nome ou código estão ausentes', () => {
    expect(createCourseSchema.safeParse({ code: 'ADS' }).error?.issues[0].message).toBe('Informe o nome do curso');
    expect(createCourseSchema.safeParse({ name: 'ADS' }).error?.issues[0].message).toBe('Informe o código do curso');
  });
  it('updateCourseSchema exige id', () => {
    expect(updateCourseSchema.safeParse({ name: 'ADS', code: 'ADS' }).success).toBe(false);
    expect(updateCourseSchema.safeParse({ name: 'ADS', code: 'ADS' }).error?.issues[0].message).toBe('ID é obrigatório');
  });
});

describe('createDisciplineSchema', () => {
  const base = { courseId: 'ccourse00001', code: 'BD101', name: 'Banco de Dados I' };
  it('coage a carga horária vinda como string', () => {
    expect(createDisciplineSchema.parse({ ...base, workloadHours: '80' }).workloadHours).toBe(80);
  });
  it('limita a carga horária com mensagens pt-BR', () => {
    const msg = (v: unknown) => createDisciplineSchema.safeParse({ ...base, workloadHours: v }).error?.issues[0].message;
    expect(msg(0)).toBe('A carga horária deve ser maior que zero');
    expect(msg(1001)).toBe('Informe no máximo 1000 horas');
    expect(msg(80.5)).toBe('Informe a carga horária em horas inteiras');
  });
  it('exige a carga horária com mensagem pt-BR, mesmo ausente', () => {
    expect(createDisciplineSchema.safeParse(base).error?.issues[0].message).toBe('Informe a carga horária');
    expect(createDisciplineSchema.safeParse({ ...base, workloadHours: 'abc' }).error?.issues[0].message).toBe('Informe a carga horária');
  });
  it('exige courseId cuid com mensagem pt-BR, mesmo ausente', () => {
    const { courseId: _omit, ...semCurso } = base;
    expect(createDisciplineSchema.safeParse({ ...semCurso, workloadHours: 80 }).error?.issues[0].message).toBe('Curso inválido');
    expect(createDisciplineSchema.safeParse({ ...base, courseId: 'x', workloadHours: 80 }).error?.issues[0].message).toBe('Curso inválido');
  });
  it('exige código e nome com mensagem pt-BR, mesmo ausentes', () => {
    expect(createDisciplineSchema.safeParse({ courseId: base.courseId, name: base.name, workloadHours: 80 }).error?.issues[0].message).toBe('Informe o código da disciplina');
    expect(createDisciplineSchema.safeParse({ courseId: base.courseId, code: base.code, workloadHours: 80 }).error?.issues[0].message).toBe('Informe o nome da disciplina');
  });
  it('updateDisciplineSchema descarta courseId e exige id', () => {
    const parsed = updateDisciplineSchema.parse({ ...base, id: 'd1', workloadHours: 80 });
    expect(parsed).not.toHaveProperty('courseId');
    expect(updateDisciplineSchema.safeParse({ code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 }).error?.issues[0].message).toBe('ID é obrigatório');
  });
});
