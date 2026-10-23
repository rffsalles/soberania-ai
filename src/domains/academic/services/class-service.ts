import { DomainError } from '@/lib/api/domain-error';
import type { CreateClassInput } from '@/lib/validators/admin.validator';
import * as realRepo from './class-repository';

export type ClassDeps = {
  repo: Pick<typeof realRepo, 'listClasses' | 'findClassById' | 'findClassByCode' | 'createClass' | 'updateClass'>;
};

export type ClassSummary = Awaited<ReturnType<typeof realRepo.listClasses>>[number];

const defaultDeps: ClassDeps = { repo: realRepo };

/** Turmas do admin: listagem para vínculo e CRUD sem exclusão. */
export function listClasses(deps: ClassDeps = defaultDeps) {
  return deps.repo.listClasses();
}

export async function createClass(input: CreateClassInput, deps: ClassDeps = defaultDeps) {
  if (await deps.repo.findClassByCode(input.code)) {
    throw new DomainError(409, 'Já existe uma turma com este código.');
  }
  return deps.repo.createClass(input);
}

export async function updateClass(id: string, input: CreateClassInput, deps: ClassDeps = defaultDeps) {
  const sameCode = await deps.repo.findClassByCode(input.code);
  if (sameCode && sameCode.id !== id) throw new DomainError(409, 'Já existe uma turma com este código.');
  if (!(await deps.repo.findClassById(id))) throw new DomainError(404, 'Turma não encontrada.');
  return deps.repo.updateClass(id, input);
}
