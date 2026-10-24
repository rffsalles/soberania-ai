import type { AcademicLevel } from '@prisma/client';
import { db } from '@/lib/db';
import type { CreateCourseInput } from '@/lib/validators/admin.validator';

const coursePublicSelect = { id: true, name: true, code: true, academicLevel: true } as const;

export type CoursePublic = { id: string; name: string; code: string; academicLevel: AcademicLevel };

export async function listCourses() {
  return db.course.findMany({
    select: { ...coursePublicSelect, _count: { select: { disciplines: true, classes: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function findCourseById(id: string): Promise<CoursePublic | null> {
  return db.course.findUnique({ where: { id }, select: coursePublicSelect });
}

export async function findCourseByCode(code: string): Promise<CoursePublic | null> {
  return db.course.findUnique({ where: { code }, select: coursePublicSelect });
}

export async function createCourse(data: CreateCourseInput): Promise<CoursePublic> {
  return db.course.create({ data, select: coursePublicSelect });
}

export async function updateCourse(id: string, data: CreateCourseInput): Promise<CoursePublic> {
  return db.course.update({ where: { id }, data, select: coursePublicSelect });
}
