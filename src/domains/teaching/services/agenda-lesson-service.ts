import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { LESSON_STATUS, type LessonMediaType } from '@/lib/constants/teaching';
import { getAgendaForUser, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { resolveMediaType } from '../media-type';
import { timeScriptSchema, type TimeScriptItem } from '../time-script';
import { findLessonPlayerData } from './lesson-plan-repository';

export type AgendaLessonDTO = {
  videoUrl: string | null;
  mediaType: LessonMediaType;
  timeScript: TimeScriptItem[];
  topicTitle: string;
  dailyObjective: string;
};

export type PlayerLessonRecord = {
  status: string;
  topicTitle: string;
  dailyObjective: string;
  timeScript: unknown;
  mediaType: string | null;
  mediaUrl: string | null;
};

export type AgendaLessonDeps = {
  getAgenda: (id: string, user: AgendaActor) => Promise<AgendaDTO>;
  findLesson: (id: string) => Promise<PlayerLessonRecord | null>;
};

const defaultDeps: AgendaLessonDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  findLesson: findLessonPlayerData,
};

const LESSON_NOT_FOUND = 'Esta agenda não possui plano de aula.';

/** Dados do plano de aula vinculado a uma agenda (escopo validado pela agenda). */
export async function getAgendaLesson(
  user: AgendaActor,
  agendaId: string,
  deps: AgendaLessonDeps = defaultDeps
): Promise<AgendaLessonDTO> {
  const agenda = await deps.getAgenda(agendaId, user);
  const lesson = agenda.lessonPlanId ? await deps.findLesson(agenda.lessonPlanId) : null;
  if (!lesson) throw new DomainError(404, LESSON_NOT_FOUND);
  // O aluno só vê aulas publicadas e de agendas não canceladas.
  if (user.role === Role.STUDENT && (lesson.status !== LESSON_STATUS.PUBLISHED || agenda.status === 'CANCELLED')) {
    throw new DomainError(404, LESSON_NOT_FOUND);
  }
  const videoUrl = agenda.videoUrl ?? lesson.mediaUrl ?? null;
  const parsed = timeScriptSchema.safeParse(lesson.timeScript);
  return {
    videoUrl,
    mediaType: resolveMediaType(videoUrl),
    timeScript: parsed.success ? parsed.data : [],
    topicTitle: lesson.topicTitle,
    dailyObjective: lesson.dailyObjective,
  };
}
