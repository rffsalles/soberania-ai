import { Prisma, Role, type TeachingPlan } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { DEFAULT_NDE_COMPLIANCE_STATUS, PLAN_STATUS } from '@/lib/constants/teaching';
import type { UpdateTeachingPlanInput } from '@/lib/validators/teaching-plan.validator';
import * as realRepo from './teaching-plan-repository';

export type PlanRecord = TeachingPlan;
export type PlanActor = { id: string; role: Role };

export type TeachingPlanDeps = {
  repo: {
    findPlans(filter: { teacherId?: string; subjectId?: string }): Promise<PlanRecord[]>;
    findPlanById(id: string): Promise<PlanRecord | null>;
    insertPlan(data: Prisma.TeachingPlanUncheckedCreateInput): Promise<PlanRecord>;
    updatePlanById(id: string, data: Prisma.TeachingPlanUncheckedUpdateInput): Promise<PlanRecord>;
  };
};

const defaultDeps: TeachingPlanDeps = { repo: realRepo };

export type CreatePlanInput = {
  subjectId?: string;
  academicPeriodId?: string | null;
  syllabus?: string;
  generalObjectives?: string;
  specificObjectives?: string;
  unitsContent?: Prisma.InputJsonValue;
  methodology?: string;
  assessmentCriteria?: string;
  basicBibliography?: string[];
  complementaryBiblio?: string[];
  status?: string;
  totalHours?: number | string;
  theoryHours?: number | string;
  practiceHours?: number | string;
  ndeComplianceStatus?: string;
};

/** Inteiro não negativo informado pelo professor; null quando ausente ou inválido (sem valor inventado). */
function toHours(value: number | string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function assertOwnsPlan(user: PlanActor, plan: { teacherId: string }) {
  if (user.role === Role.TEACHER && plan.teacherId !== user.id) {
    throw new DomainError(403, 'Você não tem acesso a este plano de ensino.');
  }
}

export function listPlansForTeacher(
  user: PlanActor,
  filter: { subjectId?: string } = {},
  deps: TeachingPlanDeps = defaultDeps
) {
  return deps.repo.findPlans({
    subjectId: filter.subjectId,
    ...(user.role === Role.TEACHER ? { teacherId: user.id } : {}),
  });
}

export async function getPlan(id: string, user: PlanActor, deps: TeachingPlanDeps = defaultDeps) {
  const plan = await deps.repo.findPlanById(id);
  if (!plan) throw new DomainError(404, 'Plano de ensino não encontrado.');
  assertOwnsPlan(user, plan);
  return plan;
}

export async function createPlan(user: PlanActor, input: CreatePlanInput, deps: TeachingPlanDeps = defaultDeps) {
  if (!input.subjectId || !input.syllabus) {
    throw new DomainError(400, 'Disciplina e ementa são obrigatórias.');
  }
  const hours = [input.totalHours, input.theoryHours, input.practiceHours].map(toHours);
  if (hours.some((h) => h === null) || (hours[0] as number) <= 0) {
    throw new DomainError(400, 'Informe a carga horária total (maior que zero), teórica e prática.');
  }
  const [totalHours, theoryHours, practiceHours] = hours as number[];
  return deps.repo.insertPlan({
    subjectId: input.subjectId,
    teacherId: user.id,
    academicPeriodId: input.academicPeriodId || null,
    syllabus: input.syllabus,
    generalObjectives: input.generalObjectives || '',
    specificObjectives: input.specificObjectives || '',
    unitsContent: input.unitsContent || [],
    methodology: input.methodology || '',
    assessmentCriteria: input.assessmentCriteria || '',
    basicBibliography: input.basicBibliography || [],
    complementaryBiblio: input.complementaryBiblio || [],
    status: input.status || PLAN_STATUS.DRAFT,
    totalHours,
    theoryHours,
    practiceHours,
    ndeComplianceStatus: input.ndeComplianceStatus || DEFAULT_NDE_COMPLIANCE_STATUS,
  });
}

export async function updatePlan(
  id: string,
  user: PlanActor,
  input: UpdateTeachingPlanInput,
  deps: TeachingPlanDeps = defaultDeps
) {
  const existing = await deps.repo.findPlanById(id);
  if (!existing) throw new DomainError(404, 'Plano de ensino não encontrado para atualização.');
  assertOwnsPlan(user, existing);

  const { unitsContent, ...rest } = input;
  return deps.repo.updatePlanById(id, {
    ...rest,
    ...(unitsContent !== undefined ? { unitsContent: unitsContent as Prisma.InputJsonValue } : {}),
  });
}
