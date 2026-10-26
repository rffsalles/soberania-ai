import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { getAgendaLesson, type AgendaLessonDeps, type PlayerLessonRecord } from '../agenda-lesson-service';

const student = { id: 's1', role: Role.STUDENT, classId: 'c1' };
const teacher = { id: 't1', role: Role.TEACHER, classId: null };

const lessonRow = (status: string): PlayerLessonRecord => ({
  status,
  topicTitle: 'T',
  dailyObjective: 'O',
  timeScript: [],
  mediaType: null,
  mediaUrl: null,
});

const deps = (status: string, agendaStatus = 'SCHEDULED'): AgendaLessonDeps => ({
  getAgenda: async () => ({ lessonPlanId: 'l1', videoUrl: null, status: agendaStatus }) as unknown as AgendaDTO,
  findLesson: async () => lessonRow(status),
});

describe('getAgendaLesson visibilidade', () => {
  it('aluno em aula DRAFT → 404', async () => {
    await expect(getAgendaLesson(student, 'a1', deps('DRAFT'))).rejects.toMatchObject({ status: 404 });
  });
  it('aluno em agenda CANCELLED → 404', async () => {
    await expect(getAgendaLesson(student, 'a1', deps('PUBLISHED', 'CANCELLED'))).rejects.toMatchObject({ status: 404 });
  });
  it('professor em aula DRAFT → ok', async () => {
    await expect(getAgendaLesson(teacher, 'a1', deps('DRAFT'))).resolves.toMatchObject({ topicTitle: 'T' });
  });
  it('aluno em aula PUBLISHED → ok', async () => {
    await expect(getAgendaLesson(student, 'a1', deps('PUBLISHED'))).resolves.toMatchObject({ topicTitle: 'T' });
  });
});
