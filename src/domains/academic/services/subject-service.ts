import { Role } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { DomainError } from '@/lib/api/domain-error';
import type { CreateOfferingInput } from '@/lib/validators/admin.validator';
import * as realRepo from './subject-repository';
import * as classRepo from './class-repository';
import * as disciplineRepo from './discipline-repository';
import * as teacherRepo from './teacher-subject-repository';

export type SubjectActor = { id: string; role: Role };

export type OfferingContext = {
  subjectName: string;
  courseName: string;
  academicPeriod: string;
  workloadHours: number;
};

export type SubjectDeps = {
  repo: Pick<
    typeof realRepo,
    | 'listSubjects'
    | 'findSubjectById'
    | 'findSubjectByDisciplineAndClass'
    | 'findOfferingContext'
    | 'createSubjectWithTeachers'
    | 'replaceSubjectTeachers'
  >;
  classes: Pick<typeof classRepo, 'findClassById'>;
  disciplines: Pick<typeof disciplineRepo, 'findDisciplineById'>;
  assignments: Pick<typeof teacherRepo, 'isTeacherAssigned'>;
};

const defaultDeps: SubjectDeps = {
  repo: realRepo,
  classes: classRepo,
  disciplines: disciplineRepo,
  assignments: teacherRepo,
};

/** TEACHER vê só as ofertas em que está alocado; os demais papéis veem todas. */
export function listSubjects(user: SubjectActor, deps: SubjectDeps = defaultDeps) {
  const where = user.role === Role.TEACHER ? { teacherAssignments: { some: { teacherId: user.id } } } : {};
  return deps.repo.listSubjects(where);
}

export async function createSubject(input: CreateOfferingInput, deps: SubjectDeps = defaultDeps) {
  const { classId, disciplineId, teacherIds } = input;
  const klass = await deps.classes.findClassById(classId);
  if (!klass) throw new DomainError(404, 'Turma não encontrada.');
  const discipline = await deps.disciplines.findDisciplineById(disciplineId);
  if (!discipline) throw new DomainError(404, 'Disciplina não encontrada.');
  if (discipline.courseId !== klass.courseId) {
    throw new DomainError(400, 'A disciplina não pertence ao curso da turma.');
  }
  if (await deps.repo.findSubjectByDisciplineAndClass(disciplineId, classId)) {
    throw new DomainError(409, 'Esta disciplina já é ofertada nesta turma.');
  }
  return deps.repo.createSubjectWithTeachers({ disciplineId, classId }, teacherIds);
}

export async function updateSubject(id: string, input: { teacherIds: string[] }, deps: SubjectDeps = defaultDeps) {
  if (!(await deps.repo.findSubjectById(id))) throw new DomainError(404, 'Oferta não encontrada.');
  return deps.repo.replaceSubjectTeachers(id, input.teacherIds);
}

/** Lança 403 se um TEACHER não está alocado à oferta; ADMIN (e demais papéis) passam. */
export async function assertTeacherAssigned(
  user: SubjectActor,
  subjectId: string,
  deps: Pick<SubjectDeps, 'assignments'> = defaultDeps
): Promise<void> {
  if (user.role !== Role.TEACHER) return;
  if (!(await deps.assignments.isTeacherAssigned(user.id, subjectId))) {
    throw new DomainError(403, 'Você não está alocado a esta oferta.');
  }
}

export async function getOfferingContext(
  subjectId: string,
  user: SubjectActor,
  deps: SubjectDeps = defaultDeps
): Promise<OfferingContext> {
  const offering = await deps.repo.findOfferingContext(subjectId);
  if (!offering) throw new DomainError(404, 'Oferta não encontrada.');
  await assertTeacherAssigned(user, subjectId, deps);
  return {
    subjectName: offering.discipline.name,
    courseName: offering.class.course.name,
    academicPeriod: offering.class.academicPeriod.name,
    workloadHours: offering.discipline.workloadHours,
  };
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
