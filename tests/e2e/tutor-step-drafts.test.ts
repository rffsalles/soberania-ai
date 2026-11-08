import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_DB_URL = process.env.DATABASE_URL_TEST;
const STUDENT_ENROLLMENT = '202601001';
const MS_PER_HOUR = 3_600_000;

describe.skipIf(!TEST_DB_URL)('tutor_step_drafts (banco)', () => {
  let db: typeof import('@/lib/db').db;
  let repo: typeof import('@/domains/classroom/tutor-step-draft-repository');
  let planId: string;
  let agendaId: string;
  let studentId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import('@/lib/db')).db;
    repo = await import('@/domains/classroom/tutor-step-draft-repository');
    const student = await db.user.findFirstOrThrow({ where: { enrollment: STUDENT_ENROLLMENT } });
    studentId = student.id;
    const schedule = await db.courseSchedule.findFirstOrThrow();
    const plan = await db.lessonPlan.create({
      data: {
        courseScheduleId: schedule.id,
        classDate: new Date(),
        classNumber: 999,
        topicTitle: 'Plano descartável tutor-drafts',
        dailyObjective: 'x',
        timeScript: [],
        methodology: 'x',
        resourcesNeeded: [],
        fixationExercise: 'x',
      },
    });
    planId = plan.id;
    const start = new Date();
    const agenda = await db.agenda.create({
      data: {
        title: 'Aula descartável tutor-drafts',
        subject: 'Teste',
        type: 'CLASSROOM',
        startTime: start,
        endTime: new Date(start.getTime() + MS_PER_HOUR),
        classId: student.classId!,
      },
    });
    agendaId = agenda.id;
  });

  afterAll(async () => {
    if (agendaId) await db.agenda.deleteMany({ where: { id: agendaId } });
    if (planId) await db.lessonPlan.deleteMany({ where: { id: planId } });
    await db.$disconnect();
  });

  it('reserva: segunda tentativa falha; expira em 60 s; teto de 2 chamadas bloqueia', async () => {
    const { ensureDraft, claimDraft, spendCall, releaseDraft } = repo;
    const d = await ensureDraft(planId, 0, 'h1');
    expect(d.claimActive).toBe(false);
    const first = await claimDraft(d.id);
    expect(first).not.toBeNull();
    expect(await claimDraft(d.id)).toBeNull();
    expect((await ensureDraft(planId, 0, 'h1')).claimActive).toBe(true);
    await db.$executeRaw`UPDATE tutor_step_drafts SET "claimedAt" = now() - interval '61 seconds' WHERE id = ${d.id}`;
    expect((await ensureDraft(planId, 0, 'h1')).claimActive).toBe(false);
    const second = await claimDraft(d.id);
    expect(second).not.toBeNull();
    // Dono antigo (reserva vencida) não libera a reserva do novo dono.
    const staleClaim = await db.$queryRaw<{ t: string }[]>`SELECT (now() - interval '61 seconds')::timestamp(3)::text AS t`;
    await releaseDraft(d.id, staleClaim[0].t);
    expect((await ensureDraft(planId, 0, 'h1')).claimActive).toBe(true);
    // Dono antigo não gasta chamada da reserva do novo dono.
    expect(await spendCall(d.id, staleClaim[0].t)).toBe('LOST');
    expect([await spendCall(d.id, second!), await spendCall(d.id, second!), await spendCall(d.id, second!)]).toEqual([
      'SPENT',
      'SPENT',
      'BUDGET',
    ]);
    await releaseDraft(d.id, second!);
    expect((await ensureDraft(planId, 0, 'h1')).claimActive).toBe(false);
    expect(await claimDraft(d.id)).toBeNull(); // calls = 2
  });

  it('hash novo zera calls e conteúdo; hash igual preserva', async () => {
    const { ensureDraft, claimDraft, spendCall, saveDraftContent } = repo;
    const d = await ensureDraft(planId, 1, 'a');
    const claim = (await claimDraft(d.id))!;
    expect(await spendCall(d.id, claim)).toBe('SPENT');
    expect(await saveDraftContent(d.id, claim, 'a', { card: { x: 1 } })).toBe(true);
    expect(await saveDraftContent(d.id, claim, 'a', { question: { q: 1 } })).toBe(true);
    expect(await ensureDraft(planId, 1, 'a')).toMatchObject({ calls: 1, card: { x: 1 }, question: { q: 1 } });
    expect(await ensureDraft(planId, 1, 'b')).toMatchObject({ calls: 0, card: null, stepHash: 'b' });
  });

  it('worker antigo (hash velho) não grava nem gasta na linha zerada pelo hash novo', async () => {
    const { ensureDraft, claimDraft, spendCall, saveDraftContent } = repo;
    const d = await ensureDraft(planId, 2, 'old');
    const staleClaim = (await claimDraft(d.id))!;
    expect(await spendCall(d.id, staleClaim)).toBe('SPENT');
    // Professor salva e prepara: hash novo zera a linha e outro worker reserva.
    await ensureDraft(planId, 2, 'new');
    const freshClaim = (await claimDraft(d.id))!;
    expect(freshClaim).not.toBeNull();
    expect(await spendCall(d.id, staleClaim)).toBe('LOST');
    expect(await saveDraftContent(d.id, staleClaim, 'old', { card: { stale: true } })).toBe(false);
    // Mesmo com a reserva certa, hash diferente não grava.
    expect(await saveDraftContent(d.id, freshClaim, 'old', { card: { stale: true } })).toBe(false);
    expect(await ensureDraft(planId, 2, 'new')).toMatchObject({ calls: 0, card: null, stepHash: 'new' });
    expect(await saveDraftContent(d.id, freshClaim, 'new', { card: { fresh: true } })).toBe(true);
    expect(await ensureDraft(planId, 2, 'new')).toMatchObject({ card: { fresh: true } });
  });

  it('resposta única por aluno e evento; classEventSeq nulo repete livre', async () => {
    const base = {
      agendaId,
      studentId,
      type: 'SOCRATIC_CHALLENGE',
      questionText: 'q',
      responseText: 'r',
      isSocraticChallenge: true,
    } as const;
    await db.studentInteraction.create({ data: { ...base, classEventSeq: 7 } });
    await expect(db.studentInteraction.create({ data: { ...base, classEventSeq: 7 } })).rejects.toMatchObject({
      code: 'P2002',
    });
    await db.studentInteraction.create({ data: base });
    await db.studentInteraction.create({ data: base });
  });

  it('índice parcial class_events_tutor_step_uq continua existindo', async () => {
    const r = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'class_events_tutor_step_uq'`;
    expect(r[0].n).toBe(1);
  });
});
