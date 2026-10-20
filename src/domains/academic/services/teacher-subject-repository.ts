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
    select: { ...teacherSelect, teacherSubjects: { include: { subject: true } } },
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
