import { AgendaStatus, AgendaType, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { ASSESSMENT_STATUS } from '@/lib/constants/teaching';
import type { CreateAgendaInput } from '@/lib/validators/agenda.validator';
import { deriveAgendaStatus } from '../agenda-validator';
import * as realRepo from './agenda-repository';
import type { AgendaRecord, AgendaScope } from './agenda-repository';

export type AgendaActor = { id: string; role: Role; classId: string | null };

export type AgendaDTO = {
  id: string;
  title: string;
  subject: string;
  type: AgendaType;
  status: AgendaStatus;
  startTime: string;
  endTime: string;
  videoUrl?: string;
  classId: string;
  className: string;
  teacherName: string;
  lessonPlanId?: string;
  assessmentId?: string;
};

export type AgendaDeps = {
  repo: {
    findAgendas(scope: AgendaScope): Promise<AgendaRecord[]>;
    findAgendaById(id: string): Promise<AgendaRecord | null>;
    findTeacherSubjectIds(teacherId: string): Promise<string[]>;
    findSubject(subjectId: string): Promise<{ name: string; classId: string } | null>;
    findLessonPlanSubjectId(lessonPlanId: string): Promise<string | null>;
    findAssessmentRef(assessmentId: string): Promise<{ subjectId: string; status: string } | null>;
    insertAgenda(data: Parameters<typeof realRepo.insertAgenda>[0]): Promise<AgendaRecord>;
    updateAgendaStatus(id: string, status: AgendaStatus): Promise<AgendaRecord>;
  };
  now: () => Date;
};

const defaultDeps: AgendaDeps = { repo: realRepo, now: () => new Date() };

const NOT_FOUND = 'Agenda não encontrada.';

function toDTO(a: AgendaRecord, now: Date): AgendaDTO {
  return {
    id: a.id,
    title: a.title,
    subject: a.subject,
    type: a.type,
    status: deriveAgendaStatus(a, now) as AgendaStatus,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    ...(a.videoUrl ? { videoUrl: a.videoUrl } : {}),
    classId: a.classId,
    className: a.class.name,
    teacherName: a.teacher?.name ?? '',
    ...(a.lessonPlanId ? { lessonPlanId: a.lessonPlanId } : {}),
    ...(a.assessmentId ? { assessmentId: a.assessmentId } : {}),
  };
}

async function resolveScope(user: AgendaActor, deps: AgendaDeps): Promise<AgendaScope | null> {
  if (user.role === Role.ADMIN) return { kind: 'all' };
  if (user.role === Role.TEACHER) {
    return { kind: 'teacher', teacherId: user.id, subjectIds: await deps.repo.findTeacherSubjectIds(user.id) };
  }
  return user.classId ? { kind: 'class', classId: user.classId } : null;
}

function inScope(a: AgendaRecord, scope: AgendaScope | null): boolean {
  if (!scope) return false;
  switch (scope.kind) {
    case 'all':
      return true;
    case 'class':
      return a.classId === scope.classId;
    case 'teacher':
      return a.teacherId === scope.teacherId || (!!a.subjectId && scope.subjectIds.includes(a.subjectId));
  }
}

function assertCanManage(user: AgendaActor) {
  if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
    throw new DomainError(403, 'Apenas professores e administradores podem gerenciar agendas.');
  }
}

async function loadInScope(id: string, user: AgendaActor, deps: AgendaDeps): Promise<AgendaRecord> {
  const agenda = await deps.repo.findAgendaById(id);
  if (!agenda || !inScope(agenda, await resolveScope(user, deps))) throw new DomainError(404, NOT_FOUND);
  return agenda;
}

export async function listAgendasForUser(user: AgendaActor, deps: AgendaDeps = defaultDeps): Promise<AgendaDTO[]> {
  const scope = await resolveScope(user, deps);
  if (!scope) return [];
  const rows = (await deps.repo.findAgendas(scope)).filter((a) => inScope(a, scope));
  const now = deps.now();
  return rows.map((a) => toDTO(a, now));
}

export async function getAgendaForUser(
  id: string,
  user: AgendaActor,
  deps: AgendaDeps = defaultDeps
): Promise<AgendaDTO> {
  return toDTO(await loadInScope(id, user, deps), deps.now());
}

/** Turma, plano de aula e avaliação precisam pertencer à disciplina da agenda (sem IDOR entre professores). */
async function assertAgendaReferences(
  input: CreateAgendaInput,
  subjectClassId: string,
  deps: AgendaDeps
): Promise<void> {
  if (input.classId !== subjectClassId) {
    throw new DomainError(400, 'A turma informada não é a turma desta disciplina.');
  }
  if (input.lessonPlanId) {
    const lessonSubjectId = await deps.repo.findLessonPlanSubjectId(input.lessonPlanId);
    if (lessonSubjectId !== input.subjectId) {
      throw new DomainError(403, 'O plano de aula não pertence a um plano de ensino desta disciplina.');
    }
  }
  if (input.assessmentId) {
    const assessment = await deps.repo.findAssessmentRef(input.assessmentId);
    if (!assessment || assessment.subjectId !== input.subjectId) {
      throw new DomainError(403, 'A avaliação não pertence a um plano de ensino desta disciplina.');
    }
    if (input.type === AgendaType.EXAM && assessment.status !== ASSESSMENT_STATUS.PUBLISHED) {
      throw new DomainError(400, 'Somente avaliações publicadas podem ser agendadas como prova.');
    }
  }
}

export async function createAgenda(
  user: AgendaActor,
  input: CreateAgendaInput,
  deps: AgendaDeps = defaultDeps
): Promise<AgendaDTO> {
  assertCanManage(user);
  if (user.role === Role.TEACHER) {
    const allocated = await deps.repo.findTeacherSubjectIds(user.id);
    if (!allocated.includes(input.subjectId)) {
      throw new DomainError(403, 'Você não está alocado a esta disciplina.');
    }
  }
  const subject = await deps.repo.findSubject(input.subjectId);
  if (!subject) throw new DomainError(404, 'Disciplina não encontrada.');
  await assertAgendaReferences(input, subject.classId, deps);

  const created = await deps.repo.insertAgenda({
    title: input.title,
    subject: subject.name,
    type: input.type,
    status: AgendaStatus.SCHEDULED,
    startTime: new Date(input.startTime),
    endTime: new Date(input.endTime),
    videoUrl: input.videoUrl ?? null,
    classId: input.classId,
    teacherId: user.id,
    subjectId: input.subjectId,
    lessonPlanId: input.lessonPlanId ?? null,
    assessmentId: input.assessmentId ?? null,
  });
  return toDTO(created, deps.now());
}

export async function setAgendaStatus(
  id: string,
  user: AgendaActor,
  status: AgendaStatus,
  deps: AgendaDeps = defaultDeps
): Promise<AgendaDTO> {
  assertCanManage(user);
  await loadInScope(id, user, deps);
  return toDTO(await deps.repo.updateAgendaStatus(id, status), deps.now());
}
