import * as realRepo from './class-repository';

export type ClassDeps = { repo: Pick<typeof realRepo, 'listClasses' | 'findClassById'> };

export type ClassSummary = Awaited<ReturnType<typeof realRepo.listClasses>>[number];

/** Turmas existentes; são provisionadas por seed/banco (sem CRUD no admin nesta versão). */
export function listClasses(deps: ClassDeps = { repo: realRepo }) {
  return deps.repo.listClasses();
}
