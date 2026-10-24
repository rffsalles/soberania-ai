import { Role } from '@prisma/client';
import { db } from '@/lib/db';

const teacherSelect = {
  id: true,
  name: true,
  email: true,
  enrollment: true,
  role: true,
  createdAt: true,
} as const;

export function listTeachersWithSubjects() {
  return db.user.findMany({
    where: { role: Role.TEACHER },
    select: { ...teacherSelect, teacherSubjects: { include: { subject: { include: { discipline: true } } } } },
    orderBy: { name: 'asc' },
  });
}

export function createTeacher(data: {
  name: string;
  email: string;
  enrollment: string;
  passwordHash: string;
}) {
  return db.user.create({
    data: { ...data, role: Role.TEACHER },
    select: teacherSelect,
  });
}

export async function isTeacherAssigned(teacherId: string, subjectId: string): Promise<boolean> {
  const row = await db.teacherSubject.findUnique({
    where: { teacherId_subjectId: { teacherId, subjectId } },
    select: { teacherId: true },
  });
  return row !== null;
}
