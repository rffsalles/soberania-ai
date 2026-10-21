import { hashPassword } from '@/lib/auth/password';
import { DomainError } from '@/lib/api/domain-error';
import * as realRepo from './subject-repository';
import * as classRepo from './class-repository';
import * as teacherRepo from './teacher-subject-repository';
import type { SubjectData } from './subject-repository';

export type SubjectDeps = {
  repo: Pick<typeof realRepo, 'listSubjects' | 'createSubjectWithTeachers' | 'replaceSubjectTeachers'>;
  classes: Pick<typeof classRepo, 'findClassById'>;
};

const defaultDeps: SubjectDeps = { repo: realRepo, classes: classRepo };

/**
 * `classId` ausente mantém a turma atual (no update); `null` desvincula a turma.
 * Sem turma, a disciplina não gera agendas para alunos.
 */
type SubjectInput = Omit<SubjectData, 'class'> & { teacherIds: string[]; classId?: string | null };

async function assertClassExists(classId: string, deps: SubjectDeps) {
  if (!(await deps.classes.findClassById(classId))) throw new DomainError(404, 'Turma não encontrada.');
}

export function listSubjects(deps: SubjectDeps = defaultDeps) {
  return deps.repo.listSubjects();
}

export async function createSubject(input: SubjectInput, deps: SubjectDeps = defaultDeps) {
  const { teacherIds, classId, ...data } = input;
  if (!classId) return deps.repo.createSubjectWithTeachers(data, teacherIds);
  await assertClassExists(classId, deps);
  return deps.repo.createSubjectWithTeachers({ ...data, class: { connect: { id: classId } } }, teacherIds);
}

export async function updateSubject(id: string, input: SubjectInput, deps: SubjectDeps = defaultDeps) {
  const { teacherIds, classId, ...data } = input;
  if (classId === undefined) return deps.repo.replaceSubjectTeachers(id, data, teacherIds);
  if (classId === null) {
    return deps.repo.replaceSubjectTeachers(id, { ...data, class: { disconnect: true } }, teacherIds);
  }
  await assertClassExists(classId, deps);
  return deps.repo.replaceSubjectTeachers(id, { ...data, class: { connect: { id: classId } } }, teacherIds);
}

export type TeacherDeps = { repo: Pick<typeof teacherRepo, 'listTeachersWithSubjects' | 'createTeacher'> };

export function listTeachers(deps: TeacherDeps = { repo: teacherRepo }) {
  return deps.repo.listTeachersWithSubjects();
}

export async function createTeacher(
  input: { name: string; email: string; enrollment: string; password: string },
  deps: TeacherDeps = { repo: teacherRepo }
) {
  const { password, ...rest } = input;
  return deps.repo.createTeacher({ ...rest, passwordHash: await hashPassword(password) });
}
