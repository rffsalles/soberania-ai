import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { hashPassword } from '@/lib/auth/password';
import type { CreateStudentInput } from '@/lib/validators/admin.validator';
import * as studentRepo from './student-repository';
import * as classRepo from './class-repository';

export type StudentDeps = {
  repo: Pick<
    typeof studentRepo,
    'listStudentsByClass' | 'listStudents' | 'findStudentById' | 'findUserByEmailOrEnrollment' | 'createStudent' | 'setStudentClass'
  >;
  classes: Pick<typeof classRepo, 'findClassById'>;
  hash?: (password: string) => Promise<string>;
};

const defaultDeps: StudentDeps = { repo: studentRepo, classes: classRepo, hash: hashPassword };

async function assertClassExists(classId: string, deps: StudentDeps) {
  if (!(await deps.classes.findClassById(classId))) throw new DomainError(404, 'Turma não encontrada.');
}

/** Matrícula de alunos: o admin cadastra o aluno e o vincula a uma turma. */
export async function listStudentsByClass(classId: string, deps: StudentDeps = defaultDeps) {
  await assertClassExists(classId, deps);
  return deps.repo.listStudentsByClass(classId);
}

export function listStudents(deps: StudentDeps = defaultDeps) {
  return deps.repo.listStudents();
}

export async function createStudent(input: CreateStudentInput, deps: StudentDeps = defaultDeps) {
  await assertClassExists(input.classId, deps);
  const existing = await deps.repo.findUserByEmailOrEnrollment(input.email, input.enrollment);
  if (existing) {
    if (existing.email === input.email) throw new DomainError(409, 'Já existe um usuário com este e-mail.');
    throw new DomainError(409, 'Já existe um usuário com esta matrícula.');
  }
  const passwordHash = await (deps.hash ?? hashPassword)(input.password);
  return deps.repo.createStudent({
    name: input.name,
    email: input.email,
    enrollment: input.enrollment,
    passwordHash,
    classId: input.classId,
  });
}

export async function setStudentClass(id: string, classId: string | null, deps: StudentDeps = defaultDeps) {
  const student = await deps.repo.findStudentById(id);
  if (!student || student.role !== Role.STUDENT) throw new DomainError(404, 'Aluno não encontrado.');
  if (classId !== null) await assertClassExists(classId, deps);
  return deps.repo.setStudentClass(id, classId);
}
