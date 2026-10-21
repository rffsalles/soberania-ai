import { describe, expect, it } from 'vitest';
import { AgendaStatus, AgendaType, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { createAgendaSchema, setAgendaStatusSchema } from '@/lib/validators/agenda.validator';
import { deriveAgendaStatus } from '../../agenda-validator';
import {
  createAgenda,
  getAgendaForUser,
  listAgendasForUser,
  setAgendaStatus,
  type AgendaActor,
  type AgendaDeps,
} from '../agenda-service';
import type { AgendaRecord } from '../agenda-repository';

const NOW = new Date('2026-10-20T12:00:00Z');
const hour = 3600_000;

function makeAgenda(over: Partial<AgendaRecord> & { id: string }): AgendaRecord {
  return {
    title: 'Aula',
    subject: 'Banco de Dados',
    type: AgendaType.CLASSROOM,
    status: AgendaStatus.SCHEDULED,
    startTime: new Date(NOW.getTime() + hour),
    endTime: new Date(NOW.getTime() + 2 * hour),
    videoUrl: null,
    classId: 'class-a',
    teacherId: 'teacher-1',
    subjectId: 'subj-bd',
    lessonPlanId: null,
    assessmentId: null,
    createdAt: NOW,
    updatedAt: NOW,
    class: { name: 'Turma A' },
    teacher: { name: 'Prof Ana' },
    ...over,
  } as AgendaRecord;
}

function makeDeps(agendas: AgendaRecord[], allocations: Record<string, string[]> = {}) {
  const store = [...agendas];
  const deps: AgendaDeps = {
    now: () => NOW,
    repo: {
      // Deliberately unfiltered: the service must apply inScope itself.
      async findAgendas() {
        return [...store].sort((x, y) => x.startTime.getTime() - y.startTime.getTime());
      },
      async findAgendaById(id) {
        return store.find((a) => a.id === id) ?? null;
      },
      async findTeacherSubjectIds(teacherId) {
        return allocations[teacherId] ?? [];
      },
      async findSubject(subjectId) {
        if (subjectId === 'subj-bd') return { name: 'Banco de Dados', classId: 'class-a' };
        if (subjectId === 'subj-calc') return { name: 'Cálculo', classId: 'class-b' };
        return null;
      },
      async findLessonPlanSubjectId(lessonPlanId) {
        return ({ 'lp-bd': 'subj-bd', 'lp-calc': 'subj-calc' } as Record<string, string>)[lessonPlanId] ?? null;
      },
      async findAssessmentRef(assessmentId) {
        const refs: Record<string, { subjectId: string; status: string }> = {
          'as-bd-pub': { subjectId: 'subj-bd', status: 'PUBLISHED' },
          'as-bd-draft': { subjectId: 'subj-bd', status: 'DRAFT' },
          'as-calc-pub': { subjectId: 'subj-calc', status: 'PUBLISHED' },
        };
        return refs[assessmentId] ?? null;
      },
      async insertAgenda(data) {
        const rec = makeAgenda({ ...(data as object), id: 'new-1' } as AgendaRecord);
        store.push(rec);
        return rec;
      },
      async updateAgendaStatus(id, status) {
        const rec = store.find((a) => a.id === id)!;
        rec.status = status;
        return rec;
      },
    },
  };
  return deps;
}

const studentA: AgendaActor = { id: 's1', role: Role.STUDENT, classId: 'class-a' };
const studentB: AgendaActor = { id: 's2', role: Role.STUDENT, classId: 'class-b' };
const teacher: AgendaActor = { id: 'teacher-2', role: Role.TEACHER, classId: null };
const admin: AgendaActor = { id: 'adm', role: Role.ADMIN, classId: null };

describe('deriveAgendaStatus', () => {
  const base = {
    status: AgendaStatus.SCHEDULED,
    startTime: new Date(NOW.getTime() - hour),
    endTime: new Date(NOW.getTime() + hour),
  };
  it('is SCHEDULED before start', () => {
    const future = { ...base, startTime: new Date(NOW.getTime() + hour), endTime: new Date(NOW.getTime() + 2 * hour) };
    expect(deriveAgendaStatus(future, NOW)).toBe('SCHEDULED');
  });
  it('is LIVE within window', () => {
    expect(deriveAgendaStatus(base, NOW)).toBe('LIVE');
  });
  it('is COMPLETED after end', () => {
    expect(deriveAgendaStatus({ ...base, endTime: new Date(NOW.getTime() - 1) }, NOW)).toBe('COMPLETED');
  });
  it('keeps CANCELLED and COMPLETED', () => {
    expect(deriveAgendaStatus({ ...base, status: AgendaStatus.CANCELLED }, NOW)).toBe('CANCELLED');
    expect(deriveAgendaStatus({ ...base, status: AgendaStatus.COMPLETED }, NOW)).toBe('COMPLETED');
  });
});

describe('agenda scope', () => {
  const agendas = [
    makeAgenda({ id: 'a1' }),
    makeAgenda({ id: 'a2', classId: 'class-b', subjectId: 'subj-x', teacherId: 'other' }),
  ];

  it('student sees only own class; other class gets 404', async () => {
    const deps = makeDeps(agendas);
    expect((await listAgendasForUser(studentA, deps)).map((a) => a.id)).toEqual(['a1']);
    await expect(getAgendaForUser('a1', studentB, deps)).rejects.toMatchObject({ status: 404 });
    expect((await getAgendaForUser('a1', studentA, deps)).className).toBe('Turma A');
  });

  it('student without class sees nothing', async () => {
    const deps = makeDeps(agendas);
    const noClass = { ...studentA, classId: null };
    expect(await listAgendasForUser(noClass, deps)).toEqual([]);
    await expect(getAgendaForUser('a1', noClass, deps)).rejects.toBeInstanceOf(DomainError);
  });

  it('teacher without allocation gets 404, with allocation sees it', async () => {
    const deps = makeDeps(agendas, { 'teacher-2': ['subj-x'] });
    await expect(getAgendaForUser('a1', teacher, deps)).rejects.toMatchObject({ status: 404 });
    expect((await listAgendasForUser(teacher, deps)).map((a) => a.id)).toEqual(['a2']);
    const own = makeDeps(agendas);
    expect((await getAgendaForUser('a1', { ...teacher, id: 'teacher-1' }, own)).id).toBe('a1');
  });

  it('admin sees all, ordered by startTime asc', async () => {
    const early = makeAgenda({
      id: 'a0',
      startTime: new Date(NOW.getTime() - 5 * hour),
      endTime: new Date(NOW.getTime() - 4 * hour),
    });
    const list = await listAgendasForUser(admin, makeDeps([...agendas, early]));
    expect(list.map((a) => a.id)).toEqual(['a0', 'a1', 'a2']);
    expect(list[0].status).toBe('COMPLETED');
  });
});

describe('createAgenda / setAgendaStatus', () => {
  const input = {
    title: 'Revisão',
    type: AgendaType.CLASSROOM,
    classId: 'class-a',
    subjectId: 'subj-bd',
    startTime: '2026-10-21T10:00:00Z',
    endTime: '2026-10-21T11:00:00Z',
  };

  it('student gets 403', async () => {
    await expect(createAgenda(studentA, input, makeDeps([]))).rejects.toMatchObject({ status: 403 });
    const deps = makeDeps([makeAgenda({ id: 'a1' })]);
    await expect(setAgendaStatus('a1', studentA, AgendaStatus.CANCELLED, deps)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('teacher not allocated to subject gets 403; allocated creates', async () => {
    await expect(createAgenda(teacher, input, makeDeps([]))).rejects.toMatchObject({ status: 403 });
    const dto = await createAgenda(teacher, input, makeDeps([], { 'teacher-2': ['subj-bd'] }));
    expect(dto.subject).toBe('Banco de Dados');
    expect(dto.status).toBe('SCHEDULED');
  });

  describe('posse de lessonPlanId, assessmentId e classId', () => {
    const deps = () => makeDeps([], { 'teacher-2': ['subj-bd'] });

    it('classId diferente da turma da disciplina -> 400', async () => {
      await expect(createAgenda(teacher, { ...input, classId: 'class-b' }, deps())).rejects.toMatchObject({
        status: 400,
      });
    });

    it('lessonPlanId de plano de outra disciplina ou inexistente -> 403', async () => {
      await expect(createAgenda(teacher, { ...input, lessonPlanId: 'lp-calc' }, deps())).rejects.toMatchObject({
        status: 403,
      });
      await expect(createAgenda(teacher, { ...input, lessonPlanId: 'lp-nope' }, deps())).rejects.toMatchObject({
        status: 403,
      });
      const dto = await createAgenda(teacher, { ...input, lessonPlanId: 'lp-bd' }, deps());
      expect(dto.lessonPlanId).toBe('lp-bd');
    });

    it('assessmentId de outra disciplina -> 403', async () => {
      const exam = { ...input, type: AgendaType.EXAM, assessmentId: 'as-calc-pub' };
      await expect(createAgenda(teacher, exam, deps())).rejects.toMatchObject({ status: 403 });
    });

    it('EXAM com avaliação em rascunho -> 400; publicada da mesma disciplina cria', async () => {
      const exam = { ...input, type: AgendaType.EXAM };
      await expect(createAgenda(teacher, { ...exam, assessmentId: 'as-bd-draft' }, deps())).rejects.toMatchObject({
        status: 400,
      });
      const dto = await createAgenda(teacher, { ...exam, assessmentId: 'as-bd-pub' }, deps());
      expect(dto.assessmentId).toBe('as-bd-pub');
    });
  });

  it('teacher sets status on in-scope agenda, 404 otherwise', async () => {
    const deps = makeDeps([makeAgenda({ id: 'a1' })], { 'teacher-2': ['subj-bd'] });
    expect((await setAgendaStatus('a1', teacher, AgendaStatus.CANCELLED, deps)).status).toBe('CANCELLED');
    await expect(
      setAgendaStatus('a1', { ...teacher, id: 'zzz' }, AgendaStatus.CANCELLED, deps)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('list shows teacher-created agenda outside allocations; filters other class even if repo returns it', async () => {
    const own = makeAgenda({ id: 'own', teacherId: 'teacher-2', subjectId: 'subj-unallocated' });
    const other = makeAgenda({ id: 'other', teacherId: 'x', subjectId: 'subj-unallocated' });
    const tDeps = makeDeps([own, other], { 'teacher-2': ['subj-bd'] });
    expect((await listAgendasForUser(teacher, tDeps)).map((a) => a.id)).toEqual(['own']);
    const sDeps = makeDeps([makeAgenda({ id: 'a1' }), makeAgenda({ id: 'b1', classId: 'class-b' })]);
    expect((await listAgendasForUser(studentA, sDeps)).map((a) => a.id)).toEqual(['a1']);
  });

  it('status schema accepts only CANCELLED/COMPLETED', () => {
    expect(setAgendaStatusSchema.safeParse({ status: 'CANCELLED' }).success).toBe(true);
    expect(setAgendaStatusSchema.safeParse({ status: 'COMPLETED' }).success).toBe(true);
    expect(setAgendaStatusSchema.safeParse({ status: 'LIVE' }).success).toBe(false);
    expect(setAgendaStatusSchema.safeParse({ status: 'SCHEDULED' }).success).toBe(false);
  });

  it('schema requires ISO datetime with offset', () => {
    expect(createAgendaSchema.safeParse({ ...input, startTime: '2026-10-21' }).success).toBe(false);
  });

  it('schema rejects endTime <= startTime', () => {
    expect(createAgendaSchema.safeParse({ ...input, endTime: input.startTime }).success).toBe(false);
    expect(createAgendaSchema.safeParse(input).success).toBe(true);
  });
});
