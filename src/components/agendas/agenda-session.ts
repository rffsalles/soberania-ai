import type { AgendaSession } from '@/domains/agendas/types';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';

/** Adapta o DTO da API ao formato esperado por `validateAgendaTimeWindow`. */
export function toAgendaSession(agenda: AgendaDTO): AgendaSession {
  return {
    id: agenda.id,
    title: agenda.title,
    subject: agenda.subject,
    type: agenda.type,
    status: agenda.status,
    startTime: agenda.startTime,
    endTime: agenda.endTime,
    videoUrl: agenda.videoUrl,
    classId: agenda.classId,
    className: agenda.className,
    instructorName: agenda.teacherName,
    teacherResponsible: agenda.teacherName,
  };
}
