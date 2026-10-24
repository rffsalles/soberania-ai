import { DomainError } from '@/lib/api/domain-error';
import type { CreateClassInput } from '@/lib/validators/admin.validator';
import * as realRepo from './class-repository';
import * as courseRepo from './course-repository';
import * as periodRepo from './academic-period-repository';

export type ClassDeps = {
  repo: Pick<typeof realRepo, 'listClasses' | 'findClassById' | 'findClassByCode' | 'createClass' | 'updateClass' | 'countOfferings'>;
  courses: Pick<typeof courseRepo, 'findCourseById'>;
  periods: Pick<typeof periodRepo, 'findPeriodById'>;
};

export type ClassSummary = Awaited<ReturnType<typeof realRepo.listClasses>>[number];

const defaultDeps: ClassDeps = { repo: realRepo, courses: courseRepo, periods: periodRepo };

async function assertCourseAndPeriod(input: CreateClassInput, deps: ClassDeps) {
  if (!(await deps.courses.findCourseById(input.courseId))) throw new DomainError(404, 'Curso não encontrado.');
  if (!(await deps.periods.findPeriodById(input.academicPeriodId))) throw new DomainError(404, 'Período letivo não encontrado.');
}

/** Turmas do admin: listagem para vínculo e CRUD sem exclusão. */
export function listClasses(deps: ClassDeps = defaultDeps) {
  return deps.repo.listClasses();
}

export async function createClass(input: CreateClassInput, deps: ClassDeps = defaultDeps) {
  await assertCourseAndPeriod(input, deps);
  if (await deps.repo.findClassByCode(input.code)) {
    throw new DomainError(409, 'Já existe uma turma com este código.');
  }
  return deps.repo.createClass(input);
}

export async function updateClass(id: string, input: CreateClassInput, deps: ClassDeps = defaultDeps) {
  const existing = await deps.repo.findClassById(id);
  if (!existing) throw new DomainError(404, 'Turma não encontrada.');
  const sameCode = await deps.repo.findClassByCode(input.code);
  if (sameCode && sameCode.id !== id) throw new DomainError(409, 'Já existe uma turma com este código.');
  await assertCourseAndPeriod(input, deps);
  if (input.courseId !== existing.courseId && (await deps.repo.countOfferings(id)) > 0) {
    throw new DomainError(409, 'A turma tem ofertas; não é possível trocar o curso.');
  }
  return deps.repo.updateClass(id, input);
}
