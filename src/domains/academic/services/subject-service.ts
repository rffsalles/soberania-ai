import { hashPassword } from '@/lib/auth/password';
import * as realRepo from './subject-repository';
import * as teacherRepo from './teacher-subject-repository';
import type { SubjectData } from './subject-repository';

export type SubjectDeps = {
  repo: Pick<typeof realRepo, 'listSubjects' | 'createSubjectWithTeachers' | 'replaceSubjectTeachers'>;
};

type SubjectInput = SubjectData & { teacherIds: string[] };

export function listSubjects(deps: SubjectDeps = { repo: realRepo }) {
  return deps.repo.listSubjects();
}

export function createSubject(input: SubjectInput, deps: SubjectDeps = { repo: realRepo }) {
  const { teacherIds, ...data } = input;
  return deps.repo.createSubjectWithTeachers(data, teacherIds);
}

export function updateSubject(id: string, input: SubjectInput, deps: SubjectDeps = { repo: realRepo }) {
  const { teacherIds, ...data } = input;
  return deps.repo.replaceSubjectTeachers(id, data, teacherIds);
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
