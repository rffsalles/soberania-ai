import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { updateTeachingPlanSchema } from '@/lib/validators/teaching-plan.validator';
import { PLAN_STATUS } from '@/lib/constants/teaching';
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

function makeDeps(initial: Partial<PlanRecord>[] = []) {
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

  it('createPlan stores teacherId = user.id and defaults', async () => {
    const { deps, plans } = makeDeps();
    await createPlan(teacher, { subjectId: 's1', syllabus: 'x' }, deps);
    expect(plans[0]).toMatchObject({ teacherId: 't1', status: PLAN_STATUS.DRAFT, totalHours: 80 });
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

  it('partial update leaves unspecified fields untouched and null clears academicPeriodId', async () => {
    const { deps, plans } = makeDeps([
      { id: 'p1', teacherId: 't1', subjectId: 's1', syllabus: 'a', methodology: 'm', academicPeriodId: 'ap1' },
    ]);
    await updatePlan('p1', teacher, { syllabus: 'new' }, deps);
    expect(plans[0]).toMatchObject({ syllabus: 'new', methodology: 'm', academicPeriodId: 'ap1', subjectId: 's1' });
    await updatePlan('p1', teacher, { academicPeriodId: null }, deps);
    expect(plans[0].academicPeriodId).toBeNull();
    expect(plans[0].syllabus).toBe('new');
  });

  it('update schema rejects null for non-nullable columns', () => {
    expect(updateTeachingPlanSchema.safeParse({ syllabus: null }).success).toBe(false);
    expect(updateTeachingPlanSchema.safeParse({ subjectId: null }).success).toBe(false);
    expect(updateTeachingPlanSchema.safeParse({ academicPeriodId: null }).success).toBe(true);
  });
});
