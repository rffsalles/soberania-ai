import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { listSubmissionsForAssessment, type SubmissionsDeps } from '../assessment-submissions-service';

const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const other = { id: 't2', role: Role.TEACHER, classId: null };

const deps: SubmissionsDeps = {
  findAssessment: async (id) =>
    id === 'as1'
      ? { id, title: 'Prova', durationMinutes: 60, status: 'PUBLISHED', teachingPlan: { teacherId: 't1', subjectId: 's1' } }
      : null,
  listAgendaIds: async () => ['ag1'],
  listSubmissions: async () => [
    { agendaId: 'ag1', studentId: 'u1', score: 8, maxScore: 10, submittedAt: new Date('2026-11-01T10:30:00Z'), integrityLog: [{ event: 'blur' }] },
    { agendaId: 'ag1', studentId: 'u2', score: 5, maxScore: 10, submittedAt: new Date('2026-11-01T10:40:00Z'), integrityLog: null },
  ],
  listInteractions: async () => [
    { studentId: 'u1', questionText: 'Dúvida?', responseText: 'Resposta', guardrailBlocked: false },
    { studentId: 'u2', questionText: 'Cola?', responseText: 'Bloqueado', guardrailBlocked: true },
    { studentId: 'u1', questionText: 'Outra?', responseText: 'Ok', guardrailBlocked: false },
  ],
  findUserNames: async () => new Map([['u1', 'Ana'], ['u2', 'Bruno']]),
};

describe('listSubmissionsForAssessment', () => {
  it('rejects a teacher who does not own the assessment', async () => {
    await expect(listSubmissionsForAssessment('as1', other, deps)).rejects.toMatchObject({ status: 403 });
  });

  it('404s for an unknown assessment', async () => {
    await expect(listSubmissionsForAssessment('nope', teacher, deps)).rejects.toMatchObject({ status: 404 });
  });

  it('groups each student interactions with the submission', async () => {
    const out = await listSubmissionsForAssessment('as1', teacher, deps);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ studentName: 'Ana', score: 8, maxScore: 10, agendaId: 'ag1' });
    expect(out[0].interactions.map((i) => i.questionText)).toEqual(['Dúvida?', 'Outra?']);
    expect(out[1].interactions[0].guardrailBlocked).toBe(true);
    expect(out[1].integrityLog).toBeNull();
  });
});
