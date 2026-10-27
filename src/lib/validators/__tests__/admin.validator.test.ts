import { describe, it, expect } from 'vitest';
import { createTeacherSchema, createStudentSchema, enrollStudentSchema, createOfferingSchema, updateOfferingSchema, createClassSchema, updateClassSchema, createCourseSchema, updateCourseSchema, createDisciplineSchema, updateDisciplineSchema } from '../admin.validator';

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

describe('createClassSchema', () => {
  const base = { name: '3º Semestre · ADS', code: 'ADS-2026-3A', courseId: 'ccourse00001', academicPeriodId: 'cperiod00001' };
  it('aplica posição 1 por padrão e não tem ano', () => {
    const parsed = createClassSchema.parse(base);
    expect(parsed.semester).toBe(1);
    expect(parsed).not.toHaveProperty('year');
  });
  it('aceita posição de 1 a 12 vinda como string', () => {
    expect(createClassSchema.parse({ ...base, semester: '12' }).semester).toBe(12);
  });
  it('rejeita posição fora de 1 a 12 com mensagem pt-BR', () => {
    for (const semester of [0, 13]) {
      expect(createClassSchema.safeParse({ ...base, semester }).error?.issues[0].message).toBe('Informe uma posição entre 1 e 12');
    }
  });
  it('exige curso e período com mensagem pt-BR, inválidos ou ausentes', () => {
    const { courseId: _c, ...semCurso } = base;
    const { academicPeriodId: _p, ...semPeriodo } = base;
    expect(createClassSchema.safeParse(semCurso).error?.issues[0].message).toBe('Selecione o curso');
    expect(createClassSchema.safeParse({ ...base, courseId: 'x' }).error?.issues[0].message).toBe('Selecione o curso');
    expect(createClassSchema.safeParse(semPeriodo).error?.issues[0].message).toBe('Selecione o período letivo');
  });
  it('updateClassSchema exige id', () => {
    expect(updateClassSchema.safeParse(base).success).toBe(false);
    expect(updateClassSchema.safeParse({ ...base, id: 'c1' }).success).toBe(true);
  });
});

describe('createOfferingSchema', () => {
  it('aplica teacherIds vazio por padrão', () => {
    expect(createOfferingSchema.parse({ classId: 'cclass000001', disciplineId: 'cdisc0000001' }).teacherIds).toEqual([]);
  });
  it('exige turma e disciplina com mensagem pt-BR, mesmo ausentes', () => {
    expect(createOfferingSchema.safeParse({ disciplineId: 'cdisc0000001' }).error?.issues[0].message).toBe('Selecione a turma');
    expect(createOfferingSchema.safeParse({ classId: 'cclass000001' }).error?.issues[0].message).toBe('Selecione a disciplina');
    expect(createOfferingSchema.safeParse({ classId: 'cclass000001', disciplineId: 'x' }).error?.issues[0].message).toBe('Selecione a disciplina');
  });
  it('updateOfferingSchema descarta classId e disciplineId', () => {
    expect(updateOfferingSchema.parse({ id: 's1', classId: 'cclass000001', disciplineId: 'cdisc0000001', teacherIds: ['t1'] }))
      .toEqual({ id: 's1', teacherIds: ['t1'] });
  });
  it('updateOfferingSchema exige id com mensagem pt-BR, mesmo ausente', () => {
    expect(updateOfferingSchema.safeParse({ teacherIds: [] }).error?.issues[0].message).toBe('ID é obrigatório');
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

describe('createStudentSchema', () => {
  const ok = { name: ' Ana Souza ', email: ' ANA@Escola.com ', enrollment: ' 2026001 ', password: '12345678', classId: 'cjld2cjxh0000qzrmn831i7rn' };
  it('normaliza nome, e-mail e matrícula', () => {
    const r = createStudentSchema.safeParse(ok);
    expect(r.success && r.data).toMatchObject({ name: 'Ana Souza', email: 'ana@escola.com', enrollment: '2026001' });
  });
  it.each([
    [{ name: 'Al' }, 'Informe o nome completo'],
    [{ email: 'x' }, 'E-mail inválido'],
    [{ enrollment: '12' }, 'Informe a matrícula'],
    [{ password: '1234567' }, 'A senha deve ter no mínimo 8 caracteres'],
    [{ classId: 'abc' }, 'Selecione a turma'],
    [{ classId: undefined }, 'Selecione a turma'],
  ])('rejeita %j', (patch, msg) => {
    const r = createStudentSchema.safeParse({ ...ok, ...patch });
    expect(!r.success && r.error.issues[0].message).toBe(msg);
  });
});

describe('enrollStudentSchema', () => {
  it('aceita turma e null', () => {
    expect(enrollStudentSchema.safeParse({ id: 'u1', classId: 'cjld2cjxh0000qzrmn831i7rn' }).success).toBe(true);
    expect(enrollStudentSchema.safeParse({ id: 'u1', classId: null }).success).toBe(true);
  });
  it('rejeita id vazio e turma inválida', () => {
    const a = enrollStudentSchema.safeParse({ id: '', classId: null });
    expect(!a.success && a.error.issues[0].message).toBe('ID é obrigatório');
    const b = enrollStudentSchema.safeParse({ id: 'u1', classId: 'x' });
    expect(!b.success && b.error.issues[0].message).toBe('Selecione a turma');
  });
});
