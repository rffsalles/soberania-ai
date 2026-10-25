import { Prisma, Role, type TeachingPlan } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { DEFAULT_NDE_COMPLIANCE_STATUS, PLAN_STATUS } from '@/lib/constants/teaching';
import type { UpdateTeachingPlanInput } from '@/lib/validators/teaching-plan.validator';
import * as realRepo from './teaching-plan-repository';
import * as subjectRepo from '@/domains/academic/services/subject-repository';
import * as teacherSubjectRepo from '@/domains/academic/services/teacher-subject-repository';
import { assertTeacherAssigned } from '@/domains/academic/services/subject-service';

export type PlanRecord = TeachingPlan;
export type PlanActor = { id: string; role: Role };

export type TeachingPlanDeps = {
  repo: {
    findPlans(filter: { teacherId?: string; subjectId?: string }): Promise<PlanRecord[]>;
    findPlanById(id: string): Promise<PlanRecord | null>;
    insertPlan(data: Prisma.TeachingPlanUncheckedCreateInput): Promise<PlanRecord>;
    updatePlanById(id: string, data: Prisma.TeachingPlanUncheckedUpdateInput): Promise<PlanRecord>;
  };
  offerings: { findSubjectWithWorkload(id: string): Promise<{ id: string; discipline: { workloadHours: number } } | null> };
  assignments: { isTeacherAssigned(teacherId: string, subjectId: string): Promise<boolean> };
};

const defaultDeps: TeachingPlanDeps = { repo: realRepo, offerings: subjectRepo, assignments: teacherSubjectRepo };

export type CreatePlanInput = {
  subjectId?: string;
  syllabus?: string;
  generalObjectives?: string;
  specificObjectives?: string;
  unitsContent?: Prisma.InputJsonValue;
  methodology?: string;
  assessmentCriteria?: string;
  basicBibliography?: string[];
  complementaryBiblio?: string[];
  status?: string;
  theoryHours?: number | string | null;
  practiceHours?: number | string | null;
  ndeComplianceStatus?: string;
};

/** Inteiro não negativo informado pelo professor; null quando ausente ou inválido (sem valor inventado). */
function toHours(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const HOURS_REQUIRED_MESSAGE = 'Informe as horas teóricas e práticas (números inteiros).';

/** Teórica + prática devem somar exatamente a carga da disciplina na matriz. */
function assertHoursMatchWorkload(theory: number | null, practice: number | null, workloadHours: number) {
  if (theory === null || practice === null) throw new DomainError(400, HOURS_REQUIRED_MESSAGE);
  if (theory + practice !== workloadHours) {
    throw new DomainError(
      400,
      `A soma das horas teóricas e práticas deve ser igual à carga horária da disciplina (${workloadHours}h).`
    );
  }
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
    throw new DomainError(400, 'Oferta e ementa são obrigatórias.');
  }
  const theoryHours = toHours(input.theoryHours);
  const practiceHours = toHours(input.practiceHours);
  if (theoryHours === null || practiceHours === null) throw new DomainError(400, HOURS_REQUIRED_MESSAGE);
  // A carga só existe depois de ler a oferta: ordem 400 (entrada) -> 404 -> 403 -> 400 (soma) -> gravação.
  const offering = await deps.offerings.findSubjectWithWorkload(input.subjectId);
  if (!offering) throw new DomainError(404, 'Oferta não encontrada.');
  await assertTeacherAssigned(user, input.subjectId, deps);
  const totalHours = offering.discipline.workloadHours;
  assertHoursMatchWorkload(theoryHours, practiceHours, totalHours);
  return deps.repo.insertPlan({
    subjectId: input.subjectId,
    teacherId: user.id,
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

  // totalHours nunca vem do cliente; teórica/prática só são validadas se vierem no PUT.
  const { unitsContent, ...rest } = input;
  if (rest.theoryHours !== undefined || rest.practiceHours !== undefined) {
    const offering = await deps.offerings.findSubjectWithWorkload(existing.subjectId);
    if (!offering) throw new DomainError(404, 'Oferta não encontrada.');
    assertHoursMatchWorkload(
      rest.theoryHours ?? existing.theoryHours,
      rest.practiceHours ?? existing.practiceHours,
      offering.discipline.workloadHours
    );
  }
  delete (rest as { totalHours?: unknown }).totalHours;
  return deps.repo.updatePlanById(id, {
    ...rest,
    ...(unitsContent !== undefined ? { unitsContent: unitsContent as Prisma.InputJsonValue } : {}),
  });
}
