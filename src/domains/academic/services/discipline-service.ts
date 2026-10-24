import { DomainError } from '@/lib/api/domain-error';
import type { CreateDisciplineInput, UpdateDisciplineInput } from '@/lib/validators/admin.validator';
import * as realRepo from './discipline-repository';
import * as courseRepo from './course-repository';

export type DisciplineDeps = {
  repo: Pick<
    typeof realRepo,
    'listDisciplines' | 'findDisciplineById' | 'findDisciplineByCourseAndCode' | 'createDiscipline' | 'updateDiscipline'
  >;
  courses: Pick<typeof courseRepo, 'findCourseById'>;
};

const defaultDeps: DisciplineDeps = { repo: realRepo, courses: courseRepo };

/** Disciplinas da matriz curricular: código único dentro do curso; o curso não muda na edição. */
export function listDisciplines(filter: { courseId?: string } = {}, deps: DisciplineDeps = defaultDeps) {
  return deps.repo.listDisciplines(filter);
}

export async function createDiscipline(input: CreateDisciplineInput, deps: DisciplineDeps = defaultDeps) {
  if (!(await deps.courses.findCourseById(input.courseId))) throw new DomainError(404, 'Curso não encontrado.');
  if (await deps.repo.findDisciplineByCourseAndCode(input.courseId, input.code)) {
    throw new DomainError(409, 'Já existe uma disciplina com este código neste curso.');
  }
  return deps.repo.createDiscipline(input);
}

export async function updateDiscipline(id: string, input: UpdateDisciplineInput, deps: DisciplineDeps = defaultDeps) {
  const existing = await deps.repo.findDisciplineById(id);
  if (!existing) throw new DomainError(404, 'Disciplina não encontrada.');
  const sameCode = await deps.repo.findDisciplineByCourseAndCode(existing.courseId, input.code);
  if (sameCode && sameCode.id !== id) {
    throw new DomainError(409, 'Já existe uma disciplina com este código neste curso.');
  }
  return deps.repo.updateDiscipline(id, {
    code: input.code,
    name: input.name,
    description: input.description,
    workloadHours: input.workloadHours,
  });
}
