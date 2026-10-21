import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

const agendaInclude = {
  class: { select: { name: true } },
  teacher: { select: { name: true } },
} satisfies Prisma.AgendaInclude;

export type AgendaRecord = Prisma.AgendaGetPayload<{ include: typeof agendaInclude }>;

export type AgendaScope =
  | { kind: 'all' }
  | { kind: 'class'; classId: string }
  | { kind: 'teacher'; teacherId: string; subjectIds: string[] };

function whereForScope(scope: AgendaScope): Prisma.AgendaWhereInput {
  switch (scope.kind) {
    case 'all':
      return {};
    case 'class':
      return { classId: scope.classId };
    case 'teacher':
      return { OR: [{ subjectId: { in: scope.subjectIds } }, { teacherId: scope.teacherId }] };
  }
}

export function findAgendas(scope: AgendaScope): Promise<AgendaRecord[]> {
  return db.agenda.findMany({
    where: whereForScope(scope),
    include: agendaInclude,
    orderBy: { startTime: 'asc' },
  });
}

export function findAgendaById(id: string): Promise<AgendaRecord | null> {
  return db.agenda.findUnique({ where: { id }, include: agendaInclude });
}

export async function findTeacherSubjectIds(teacherId: string): Promise<string[]> {
  const rows = await db.teacherSubject.findMany({ where: { teacherId }, select: { subjectId: true } });
  return rows.map((r) => r.subjectId);
}

export function findSubject(subjectId: string): Promise<{ name: string; classId: string | null } | null> {
  return db.subject.findUnique({ where: { id: subjectId }, select: { name: true, classId: true } });
}

/** Disciplina do plano de ensino ao qual o plano de aula pertence. */
export async function findLessonPlanSubjectId(lessonPlanId: string): Promise<string | null> {
  const row = await db.lessonPlan.findUnique({
    where: { id: lessonPlanId },
    select: { courseSchedule: { select: { teachingPlan: { select: { subjectId: true } } } } },
  });
  return row?.courseSchedule.teachingPlan.subjectId ?? null;
}

export async function findAssessmentRef(assessmentId: string): Promise<{ subjectId: string; status: string } | null> {
  const row = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: { status: true, teachingPlan: { select: { subjectId: true } } },
  });
  return row ? { subjectId: row.teachingPlan.subjectId, status: row.status } : null;
}

export function insertAgenda(data: Prisma.AgendaUncheckedCreateInput): Promise<AgendaRecord> {
  return db.agenda.create({ data, include: agendaInclude });
}

export function updateAgendaStatus(id: string, status: AgendaRecord['status']): Promise<AgendaRecord> {
  return db.agenda.update({ where: { id }, data: { status }, include: agendaInclude });
}

export type LessonAgendaData = Omit<Prisma.AgendaUncheckedCreateInput, 'lessonPlanId' | 'status'>;

/** One agenda per lesson plan (Agenda.lessonPlanId is unique); status of an existing agenda is preserved. */
export function upsertAgendaByLessonPlanId(lessonPlanId: string, data: LessonAgendaData) {
  return db.agenda.upsert({
    where: { lessonPlanId },
    create: { ...data, lessonPlanId },
    update: data,
  });
}
