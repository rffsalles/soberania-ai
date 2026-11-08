import { describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import type { ClassEventDTO } from '../class-event-schema';
import type { StepContent } from '../tutor-step-content';
import { stepHash } from '../tutor-step-hash';
import {
  listTutorDrafts,
  prepareTutorDraft,
  type DraftLesson,
  type TutorDraftDeps,
} from '../tutor-draft-service';

const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const item = (timeSeconds: number, over = {}) => ({
  timeSeconds,
  timeRange: 'x',
  activity: `Ato ${timeSeconds}`,
  description: 'descrição',
  ...over,
});
const script = [item(0), item(1800, { socraticQuestion: 'E então?' }), item(5300)];
const lessonBase: DraftLesson = {
  status: 'PUBLISHED',
  ownerId: 't1',
  dailyObjective: 'obj',
  timeScript: script,
  chapterIds: ['c1'],
};
const card = {
  concepts: [
    { title: 'A', explanation: 'EA', citation: { chunkId: 'k', label: 'L', page: 1 } },
    { title: 'B', explanation: 'EB', citation: { chunkId: 'k', label: 'L', page: 1 } },
  ],
  objectiveLink: 'liga',
  source: 'GENERATED',
};
const question = {
  kind: 'MULTIPLE_CHOICE',
  origin: 'TUTOR',
  source: 'GENERATED',
  question: {
    id: 'step-0',
    topic: 'T',
    enunciation: 'Qual é a pergunta do passo?',
    options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: `Alt ${key}` })),
    correctKey: 'A',
    rationale: 'R',
  },
};
const done = (over: Partial<Extract<StepContent, { status: 'DONE' }>> = {}): StepContent => ({
  status: 'DONE',
  noMaterial: false,
  card: { payload: card, fromDraft: false } as never,
  question: { payload: question, fromDraft: false } as never,
  failure: null,
  ...over,
});

function makeDeps(over: Partial<TutorDraftDeps> & { lesson?: Partial<DraftLesson> | null; events?: ClassEventDTO[] } = {}) {
  const deps = {
    loadLesson: vi.fn(async () => (over.lesson === null ? null : { ...lessonBase, ...over.lesson })),
    findAgenda: vi.fn(async () => ({
      id: 'ag1',
      startTime: new Date('2026-11-08T10:00:00Z'),
      endTime: new Date('2026-11-08T11:30:00Z'),
    })),
    readEvents: vi.fn(async () => over.events ?? []),
    produce: vi.fn(async () => done()),
    listDrafts: vi.fn(async () => []),
    ...over,
  } as unknown as TutorDraftDeps & { produce: ReturnType<typeof vi.fn>; listDrafts: ReturnType<typeof vi.fn> };
  delete (deps as Record<string, unknown>).lesson;
  delete (deps as Record<string, unknown>).events;
  return deps;
}

async function codeOf(p: Promise<unknown>) {
  const err = (await p.then(
    () => null,
    (e) => e,
  )) as DomainError;
  return { status: err.status, code: (err.details as { code?: string } | undefined)?.code, message: err.message };
}

describe('prepareTutorDraft', () => {
  it('READY com cartão e pergunta; wantQuestion true só no passo longo sem pergunta do professor', async () => {
    const deps = makeDeps();
    const r = await prepareTutorDraft(teacher, 'lp1', 0, deps);
    expect(r).toEqual({ stepIndex: 0, status: 'READY', card: true, question: true, message: null });
    expect(deps.produce).toHaveBeenCalledWith(
      expect.objectContaining({ agendaId: 'ag1', lessonPlanId: 'lp1', stepIndex: 0, chapterIds: ['c1'], wantQuestion: true }),
    );
  });

  it('wantQuestion false no passo com socraticQuestion e no passo curto', async () => {
    const deps = makeDeps();
    await prepareTutorDraft(teacher, 'lp1', 1, deps);
    await prepareTutorDraft(teacher, 'lp1', 2, deps);
    expect(deps.produce.mock.calls.map((c) => c[0].wantQuestion)).toEqual([false, false]);
  });

  it('BUSY sem chamada: produce devolve BUSY', async () => {
    const deps = makeDeps({ produce: vi.fn(async () => ({ status: 'BUSY' }) as StepContent) });
    expect(await prepareTutorDraft(teacher, 'lp1', 0, deps)).toEqual({
      stepIndex: 0,
      status: 'BUSY',
      card: false,
      question: false,
      message: null,
    });
  });

  it('MUTED com MUTE LESSON na agenda, sem chamar produce', async () => {
    const events: ClassEventDTO[] = [
      {
        seq: 1,
        type: 'TEACHER_NOTE',
        stepIndex: null,
        payload: { tutor: 'MUTE', scope: 'LESSON' },
        createdBy: 'TEACHER',
        createdAt: '2026-11-08T10:00:00.000Z',
      } as ClassEventDTO,
    ];
    const deps = makeDeps({ events });
    const r = await prepareTutorDraft(teacher, 'lp1', 0, deps);
    expect(r.status).toBe('MUTED');
    expect(deps.produce).not.toHaveBeenCalled();
  });

  it('FAILED traz a mensagem de tutorSkipMessage', async () => {
    const deps = makeDeps({
      produce: vi.fn(async () =>
        done({ card: null, question: null, failure: { reason: 'RATE_LIMIT', kind: 'CARD' } }),
      ),
    });
    expect(await prepareTutorDraft(teacher, 'lp1', 0, deps)).toMatchObject({
      status: 'FAILED',
      card: false,
      message: 'O provedor de IA recusou por limite de uso. Sem cartão neste passo.',
    });
  });

  it('NO_MATERIAL', async () => {
    const deps = makeDeps({ produce: vi.fn(async () => done({ noMaterial: true, card: null, question: null })) });
    expect(await prepareTutorDraft(teacher, 'lp1', 0, deps)).toMatchObject({ status: 'NO_MATERIAL', message: null });
  });

  it('READY só com cartão quando a pergunta não foi pedida', async () => {
    const deps = makeDeps({ produce: vi.fn(async () => done({ question: null })) });
    expect(await prepareTutorDraft(teacher, 'lp1', 1, deps)).toMatchObject({ status: 'READY', card: true, question: false });
  });

  it('aluno: 403', async () => {
    const deps = makeDeps();
    const e = await codeOf(prepareTutorDraft({ ...teacher, role: Role.STUDENT }, 'lp1', 0, deps));
    expect(e).toMatchObject({ status: 403, message: 'Apenas o professor da aula prepara a tutora.' });
    expect(deps.loadLesson).not.toHaveBeenCalled();
  });

  it('não dono: 403 do assertOwner; aula inexistente: 404', async () => {
    expect((await codeOf(prepareTutorDraft(teacher, 'lp1', 0, makeDeps({ lesson: { ownerId: 'outro' } })))).status).toBe(403);
    expect((await codeOf(prepareTutorDraft(teacher, 'lp1', 0, makeDeps({ lesson: null })))).status).toBe(404);
  });

  it('aula não publicada: 409 LESSON_NOT_PUBLISHED', async () => {
    const e = await codeOf(prepareTutorDraft(teacher, 'lp1', 0, makeDeps({ lesson: { status: 'DRAFT' } })));
    expect(e).toEqual({ status: 409, code: 'LESSON_NOT_PUBLISHED', message: 'Publique a aula antes de preparar a tutora.' });
  });

  it('sem agenda: 409 NO_AGENDA', async () => {
    const e = await codeOf(prepareTutorDraft(teacher, 'lp1', 0, makeDeps({ findAgenda: vi.fn(async () => null) })));
    expect(e).toEqual({ status: 409, code: 'NO_AGENDA', message: 'A aula publicada não tem agenda.' });
  });

  it('passo fora do roteiro: 400 STEP_OUT_OF_RANGE', async () => {
    const deps = makeDeps();
    const e = await codeOf(prepareTutorDraft(teacher, 'lp1', 3, deps));
    expect(e).toEqual({ status: 400, code: 'STEP_OUT_OF_RANGE', message: 'O passo informado não existe no roteiro.' });
    expect(deps.produce).not.toHaveBeenCalled();
  });
});

describe('listTutorDrafts', () => {
  const row = (stepIndex: number, hash: string, over = {}) => ({
    id: `d${stepIndex}`,
    stepIndex,
    stepHash: hash,
    card,
    question,
    calls: 1,
    ...over,
  });

  it('edição invalida só o passo editado', async () => {
    const old = script.map((s, i) => (i === 1 ? { ...s, description: 'antiga' } : s));
    const rows = [
      row(0, stepHash(script[0], ['c1'])),
      row(1, stepHash(old[1], ['c1'])),
      row(2, stepHash(script[2], ['c1'])),
    ];
    const deps = makeDeps({ listDrafts: vi.fn(async () => rows) });
    const out = await listTutorDrafts(teacher, 'lp1', deps);
    expect(out.map((d) => d.current)).toEqual([true, false, true]);
    expect(out[0].card?.concepts).toHaveLength(2);
    expect(out[0].question?.kind).toBe('MULTIPLE_CHOICE');
  });

  it('passo inexistente: current false; peça inválida: null', async () => {
    const rows = [row(7, 'h'), row(0, stepHash(script[0], ['c1']), { card: { lixo: 1 }, question: null })];
    const deps = makeDeps({ listDrafts: vi.fn(async () => rows) });
    const out = await listTutorDrafts(teacher, 'lp1', deps);
    expect(out[0].current).toBe(false);
    expect(out[1]).toMatchObject({ card: null, question: null, current: true });
  });

  it('aluno: 403', async () => {
    expect((await codeOf(listTutorDrafts({ ...teacher, role: Role.STUDENT }, 'lp1', makeDeps()))).status).toBe(403);
  });
});
