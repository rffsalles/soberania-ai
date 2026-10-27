import { Role } from '@prisma/client';
import { db } from '@/lib/db';

export const studentSelect = {
  id: true,
  name: true,
  email: true,
  enrollment: true,
  classId: true,
  createdAt: true,
} as const;

export async function listStudentsByClass(classId: string) {
  return db.user.findMany({
    where: { role: Role.STUDENT, classId },
    select: studentSelect,
    orderBy: { name: 'asc' },
  });
}

export async function listStudents() {
  return db.user.findMany({
    where: { role: Role.STUDENT },
    select: { ...studentSelect, class: { select: { id: true, name: true, code: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function findStudentById(id: string) {
  return db.user.findUnique({ where: { id }, select: { ...studentSelect, role: true } });
}

export async function findUserByEmailOrEnrollment(email: string, enrollment: string) {
  return db.user.findFirst({
    where: { OR: [{ email }, { enrollment }] },
    select: { id: true, email: true, enrollment: true },
  });
}

export async function createStudent(data: {
  name: string;
  email: string;
  enrollment: string;
  passwordHash: string;
  classId: string;
}) {
  return db.user.create({ data: { ...data, role: Role.STUDENT }, select: studentSelect });
}

export async function setStudentClass(id: string, classId: string | null) {
  return db.user.update({ where: { id }, data: { classId }, select: studentSelect });
}
