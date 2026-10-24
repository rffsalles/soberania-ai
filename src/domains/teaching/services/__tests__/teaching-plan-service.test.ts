import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { DEFAULT_NDE_COMPLIANCE_STATUS, PLAN_STATUS } from '@/lib/constants/teaching';
import {
  createPlan,
  getPlan,
  listPlansForTeacher,
  updatePlan,
  type TeachingPlanDeps,
  type PlanRecord,
} from '../teaching-plan-service';

const teacher = { id: 't1', role: Role.TEACHER };
const otherTeacher = { id: 't2', role: Role.TEACHER };
const admin = { id: 'a1', role: Role.ADMIN };

function makeDeps(initial: Partial<PlanRecord>[] = [], opts: { offerings?: string[]; assigned?: [string, string][] } = {}) {
  const plans = initial.map((p) => ({ ...p })) as PlanRecord[];
  const deps: TeachingPlanDeps = {
    repo: {
      findPlans: async ({ teacherId, subjectId }) =>
        plans.filter(
          (p) => (!teacherId || p.teacherId === teacherId) && (!subjectId || p.subjectId === subjectId)
        ),
      findPlanById: async (id) => plans.find((p) => p.id === id) ?? null,
      insertPlan: async (data) => {
        const rec = { id: `p${plans.length + 1}`, ...data } as unknown as PlanRecord;
        plans.push(rec);
        return rec;
      },
      updatePlanById: async (id, data) => {
        const rec = plans.find((p) => p.id === id)!;
        Object.assign(rec, data);
        return rec;
      },
    },
    offerings: { findSubjectById: async (id) => ((opts.offerings ?? ['s1']).includes(id) ? { id } : null) },
    assignments: {
      isTeacherAssigned: async (t, s) => (opts.assigned ?? [['t1', 's1']]).some(([a, b]) => a === t && b === s),
    },
  };
  return { deps, plans };
}

const seed = [
  { id: 'p1', teacherId: 't1', subjectId: 's1', syllabus: 'a' },
  { id: 'p2', teacherId: 't2', subjectId: 's1', syllabus: 'b' },
];

describe('teaching-plan-service', () => {
  it('listPlansForTeacher filters TEACHER by teacherId', async () => {
    const { deps } = makeDeps(seed);
    const result = await listPlansForTeacher(teacher, {}, deps);
    expect(result.map((p) => p.id)).toEqual(['p1']);
  });

  it('listPlansForTeacher returns all for ADMIN', async () => {
    const { deps } = makeDeps(seed);
    expect(await listPlansForTeacher(admin, {}, deps)).toHaveLength(2);
  });

  it('createPlan stores teacherId = user.id, the given hours and a pending NDE status', async () => {
    const { deps, plans } = makeDeps();
    await createPlan(teacher, { subjectId: 's1', syllabus: 'x', totalHours: '72', theoryHours: 48, practiceHours: 24 }, deps);
    expect(plans[0]).toMatchObject({
      teacherId: 't1',
      status: PLAN_STATUS.DRAFT,
      totalHours: 72,
      theoryHours: 48,
      practiceHours: 24,
      ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS,
    });
  });

  it('createPlan rejects missing hours with 400 instead of inventing 80/60/20', async () => {
    const { deps } = makeDeps();
    await expect(createPlan(teacher, { subjectId: 's1', syllabus: 'x' }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(
      createPlan(teacher, { subjectId: 's1', syllabus: 'x', totalHours: 80, theoryHours: 60 }, deps)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('createPlan rejects a zero total workload with 400', async () => {
    const { deps } = makeDeps();
    await expect(
      createPlan(teacher, { subjectId: 's1', syllabus: 'x', totalHours: 0, theoryHours: 0, practiceHours: 0 }, deps)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('createPlan rejects missing subject or syllabus with 400', async () => {
    const { deps } = makeDeps();
    await expect(createPlan(teacher, { syllabus: 'x' }, deps)).rejects.toMatchObject({ status: 400 });
  });

  it('updatePlan on foreign plan throws 403', async () => {
    const { deps } = makeDeps(seed);
    await expect(updatePlan('p2', teacher, { syllabus: 'z' }, deps)).rejects.toMatchObject({ status: 403 });
    await expect(updatePlan('p2', teacher, {}, deps)).rejects.toBeInstanceOf(DomainError);
  });

  it('updatePlan on missing plan throws 404', async () => {
    const { deps } = makeDeps(seed);
    await expect(updatePlan('nope', teacher, {}, deps)).rejects.toMatchObject({ status: 404 });
  });

  it('updatePlan updates own plan; ADMIN may update any', async () => {
    const { deps, plans } = makeDeps(seed);
    await updatePlan('p1', teacher, { syllabus: 'new' }, deps);
    expect(plans[0].syllabus).toBe('new');
    await updatePlan('p2', admin, { syllabus: 'adm' }, deps);
    expect(plans[1].syllabus).toBe('adm');
  });

  it('getPlan forbids foreign plan for TEACHER', async () => {
    const { deps } = makeDeps(seed);
    await expect(getPlan('p1', otherTeacher, deps)).rejects.toMatchObject({ status: 403 });
    expect((await getPlan('p1', teacher, deps)).id).toBe('p1');
  });

  it('partial update leaves unspecified fields untouched', async () => {
    const { deps, plans } = makeDeps([{ id: 'p1', teacherId: 't1', subjectId: 's1', syllabus: 'a', methodology: 'm' }]);
    await updatePlan('p1', teacher, { syllabus: 'new' }, deps);
    expect(plans[0]).toMatchObject({ syllabus: 'new', methodology: 'm', subjectId: 's1' });
  });

  const valid = { subjectId: 's1', syllabus: 'x', totalHours: 80, theoryHours: 60, practiceHours: 20 };

  it('createPlan rejeita professor não alocado com 403', async () => {
    const { deps, plans } = makeDeps();
    await expect(createPlan(otherTeacher, valid, deps)).rejects.toMatchObject({ status: 403, message: 'Você não está alocado a esta oferta.' });
    expect(plans).toHaveLength(0);
  });
  it('createPlan rejeita oferta inexistente com 404', async () => {
    const { deps } = makeDeps();
    await expect(createPlan(teacher, { ...valid, subjectId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Oferta não encontrada.' });
  });
  it('ADMIN cria plano sem alocação', async () => {
    const { deps, plans } = makeDeps();
    await createPlan(admin, valid, deps);
    expect(plans[0]).toMatchObject({ teacherId: 'a1', subjectId: 's1' });
  });
  it('insertPlan nunca recebe academicPeriodId', async () => {
    const { deps, plans } = makeDeps();
    await createPlan(teacher, { ...valid, academicPeriodId: 'ap1' } as never, deps);
    expect(plans[0]).not.toHaveProperty('academicPeriodId');
  });
  it('createPlan responde em pt-BR quando a UI envia horas null', async () => {
    const { deps } = makeDeps();
    await expect(createPlan(teacher, { ...valid, totalHours: null, theoryHours: null, practiceHours: null }, deps))
      .rejects.toMatchObject({ status: 400, message: 'Informe a carga horária total (maior que zero), teórica e prática.' });
  });
  it('createPlan usa a mensagem de oferta e ementa obrigatórias', async () => {
    const { deps } = makeDeps();
    await expect(createPlan(teacher, { syllabus: 'x' }, deps)).rejects.toMatchObject({ status: 400, message: 'Oferta e ementa são obrigatórias.' });
  });
});
