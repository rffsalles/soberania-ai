import { DomainError } from '@/lib/api/domain-error';
import type { CreateCourseInput } from '@/lib/validators/admin.validator';
import * as realRepo from './course-repository';

export type CourseDeps = {
  repo: Pick<typeof realRepo, 'listCourses' | 'findCourseById' | 'findCourseByCode' | 'createCourse' | 'updateCourse'>;
};

const defaultDeps: CourseDeps = { repo: realRepo };

/** Cursos do admin: listagem com contagens e CRUD sem exclusão. */
export function listCourses(deps: CourseDeps = defaultDeps) {
  return deps.repo.listCourses();
}

export async function createCourse(input: CreateCourseInput, deps: CourseDeps = defaultDeps) {
  if (await deps.repo.findCourseByCode(input.code)) {
    throw new DomainError(409, 'Já existe um curso com este código.');
  }
  return deps.repo.createCourse(input);
}

export async function updateCourse(id: string, input: CreateCourseInput, deps: CourseDeps = defaultDeps) {
  if (!(await deps.repo.findCourseById(id))) throw new DomainError(404, 'Curso não encontrado.');
  const sameCode = await deps.repo.findCourseByCode(input.code);
  if (sameCode && sameCode.id !== id) throw new DomainError(409, 'Já existe um curso com este código.');
  return deps.repo.updateCourse(id, input);
}
