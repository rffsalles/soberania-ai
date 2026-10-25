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

const WORKLOAD = 80;
const SUM_MSG = `A soma das horas teóricas e práticas deve ser igual à carga horária da disciplina (${WORKLOAD}h).`;

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
    offerings: {
      findSubjectWithWorkload: async (id) =>
        (opts.offerings ?? ['s1']).includes(id) ? { id, discipline: { workloadHours: WORKLOAD } } : null,
    },
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

  it('createPlan grava totalHours = carga da disciplina, ignorando o valor do cliente', async () => {
    const { deps, plans } = makeDeps();
    await createPlan(teacher, { subjectId: 's1', syllabus: 'x', totalHours: 999, theoryHours: '60', practiceHours: 20 } as never, deps);
    expect(plans[0]).toMatchObject({
      teacherId: 't1',
      status: PLAN_STATUS.DRAFT,
      totalHours: 80,
      theoryHours: 60,
      practiceHours: 20,
      ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS,
    });
  });

  it('createPlan rejeita soma diferente da carga com a mensagem exata (400)', async () => {
    const { deps, plans } = makeDeps();
    await expect(createPlan(teacher, { subjectId: 's1', syllabus: 'x', theoryHours: 60, practiceHours: 10 }, deps))
      .rejects.toMatchObject({ status: 400, message: SUM_MSG });
    expect(plans).toHaveLength(0);
  });

  it('createPlan rejeita horas ausentes ou inválidas com 400 em pt-BR, sem inventar 80/60/20', async () => {
    const { deps } = makeDeps();
    const msg = 'Informe as horas teóricas e práticas (números inteiros).';
    await expect(createPlan(teacher, { subjectId: 's1', syllabus: 'x' }, deps)).rejects.toMatchObject({ status: 400, message: msg });
    await expect(createPlan(teacher, { subjectId: 's1', syllabus: 'x', theoryHours: 80 }, deps)).rejects.toMatchObject({ status: 400, message: msg });
    await expect(createPlan(teacher, { subjectId: 's1', syllabus: 'x', theoryHours: 90.5, practiceHours: -10.5 }, deps)).rejects.toMatchObject({ status: 400, message: msg });
    await expect(createPlan(teacher, { subjectId: 's1', syllabus: 'x', theoryHours: -20, practiceHours: 100 }, deps)).rejects.toMatchObject({ status: 400, message: msg });
  });

  it('createPlan aceita 80 + 0 (soma igual à carga)', async () => {
    const { deps, plans } = makeDeps();
    await createPlan(teacher, { subjectId: 's1', syllabus: 'x', theoryHours: 80, practiceHours: 0 }, deps);
    expect(plans[0]).toMatchObject({ totalHours: 80, theoryHours: 80, practiceHours: 0 });
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

  const valid = { subjectId: 's1', syllabus: 'x', theoryHours: 60, practiceHours: 20 };

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
    await expect(createPlan(teacher, { ...valid, theoryHours: null, practiceHours: null }, deps))
      .rejects.toMatchObject({ status: 400, message: 'Informe as horas teóricas e práticas (números inteiros).' });
  });
  it('createPlan checa 404 e 403 antes da soma', async () => {
    const { deps } = makeDeps();
    const bad = { ...valid, practiceHours: 1 };
    await expect(createPlan(teacher, { ...bad, subjectId: 'nope' }, deps)).rejects.toMatchObject({ status: 404 });
    await expect(createPlan(otherTeacher, bad, deps)).rejects.toMatchObject({ status: 403 });
  });
  describe('updatePlan e horas', () => {
    const saved = { id: 'p1', teacherId: 't1', subjectId: 's1', syllabus: 'a', totalHours: 80, theoryHours: 60, practiceHours: 20 };
    it('rejeita teórica/prática que não somam a carga da oferta do plano salvo', async () => {
      const { deps, plans } = makeDeps([saved]);
      await expect(updatePlan('p1', teacher, { theoryHours: 50, practiceHours: 20 }, deps)).rejects.toMatchObject({ status: 400, message: SUM_MSG });
      expect(plans[0].theoryHours).toBe(60);
    });
    it('aceita quando a soma bate e nunca altera totalHours', async () => {
      const { deps, plans } = makeDeps([saved]);
      await updatePlan('p1', teacher, { theoryHours: 50, practiceHours: 30, totalHours: 5 } as never, deps);
      expect(plans[0]).toMatchObject({ totalHours: 80, theoryHours: 50, practiceHours: 30 });
    });
    it('envio de só uma das horas completa com o valor salvo da outra', async () => {
      const { deps, plans } = makeDeps([saved]);
      await expect(updatePlan('p1', teacher, { theoryHours: 70 }, deps)).rejects.toMatchObject({ status: 400, message: SUM_MSG });
      await updatePlan('p1', teacher, { practiceHours: 20 }, deps);
      expect(plans[0]).toMatchObject({ theoryHours: 60, practiceHours: 20 });
    });
    it('sem horas no PUT não valida (mesmo com plano legado inconsistente)', async () => {
      const { deps, plans } = makeDeps([{ ...saved, theoryHours: 1, practiceHours: 1 }]);
      await updatePlan('p1', teacher, { syllabus: 'novo' }, deps);
      expect(plans[0].syllabus).toBe('novo');
    });
  });
  it('createPlan usa a mensagem de oferta e ementa obrigatórias', async () => {
    const { deps } = makeDeps();
    await expect(createPlan(teacher, { syllabus: 'x' }, deps)).rejects.toMatchObject({ status: 400, message: 'Oferta e ementa são obrigatórias.' });
  });
});
