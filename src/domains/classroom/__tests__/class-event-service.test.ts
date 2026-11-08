import { describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import type { AgendaActor, AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { DomainError } from '@/lib/api/domain-error';
import type { TimeScriptItem } from '@/domains/teaching/time-script';
import type { ClassEventRow, NewClassEvent, AppendContext } from '../class-event-repository';
import {
  appendTeacherEvent,
  listEventsAfter,
  openEventReader,
  type ClassEventDeps,
} from '../class-event-service';

const teacher: AgendaActor = { id: 't1', role: Role.TEACHER, classId: null };
const student: AgendaActor = { id: 's1', role: Role.STUDENT, classId: 'c1' };

const script: TimeScriptItem[] = [
  { timeSeconds: 0, timeRange: '0-10', activity: 'Abertura', description: 'd0' },
  { timeSeconds: 600, timeRange: '10-20', activity: 'Conceito', description: 'd1' },
  { timeSeconds: 1200, timeRange: '20-30', activity: 'Prática', description: 'd2' },
];

function makeDeps(opts: { script?: TimeScriptItem[]; lessonPlanId?: string | null } = {}) {
  const rows: ClassEventRow[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  const findEventsAfter = vi.fn(async (_id: string, after: number, audiences: string[], limit: number) =>
    rows.filter((r) => r.seq > after && audiences.includes(r.audience)).slice(0, limit),
  );
  const appendEvents = async (_id: string, build: (ctx: AppendContext) => NewClassEvent[]) => {
    const run = async () => {
      const session = [...rows].reverse().find((r) => r.type === 'SESSION_STARTED' || r.type === 'SESSION_ENDED');
      const step = [...rows].reverse().find((r) => r.type === 'STEP_CHANGED');
      const phase = !session ? 'NOT_STARTED' : session.type === 'SESSION_STARTED' ? 'RUNNING' : 'ENDED';
      const events = build({ phase, currentStepIndex: step?.stepIndex ?? null });
      const out = events.map((e, i) => ({
        ...e,
        seq: rows.length + i + 1,
        createdAt: new Date(),
      })) as ClassEventRow[];
      rows.push(...out);
      return out;
    };
    const p = chain.then(run);
    chain = p.catch(() => undefined);
    return p;
  };
  const completeAgenda = vi.fn(async () => {});
  const getAgenda = vi.fn(async () => ({
    id: 'a1',
    ...(opts.lessonPlanId === null ? {} : { lessonPlanId: opts.lessonPlanId ?? 'lp1' }),
  }) as AgendaDTO);
  const deps: ClassEventDeps = {
    getAgenda,
    findTimeScript: vi.fn(async () => opts.script ?? script),
    repo: { appendEvents, findEventsAfter },
    completeAgenda,
  };
  return { deps, rows, completeAgenda, getAgenda, findEventsAfter };
}

async function expectDomain(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect(err.status).toBe(status);
  if (code) expect(err.details).toEqual({ code });
}

describe('appendTeacherEvent', () => {
  it('rejeita aluno com 403', async () => {
    const { deps } = makeDeps();
    await expectDomain(appendTeacherEvent(student, 'a1', { type: 'SESSION_STARTED' }, deps), 403);
  });

  it('propaga 404 do escopo da agenda', async () => {
    const { deps, getAgenda } = makeDeps();
    getAgenda.mockRejectedValueOnce(new DomainError(404, 'Agenda não encontrada.'));
    await expectDomain(appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps), 404);
  });

  it('rejeita tipos da tutora', async () => {
    const { deps } = makeDeps();
    await expectDomain(appendTeacherEvent(teacher, 'a1', { type: 'TUTOR_CARD' }, deps), 400, 'EVENT_TYPE_NOT_ALLOWED');
  });

  it('STEP_CHANGED antes de iniciar -> CLASS_NOT_STARTED', async () => {
    const { deps } = makeDeps();
    await expectDomain(
      appendTeacherEvent(teacher, 'a1', { type: 'STEP_CHANGED', stepIndex: 1 }, deps),
      409,
      'CLASS_NOT_STARTED',
    );
  });

  it('segundo SESSION_STARTED -> CLASS_ALREADY_STARTED', async () => {
    const { deps } = makeDeps();
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    await expectDomain(
      appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps),
      409,
      'CLASS_ALREADY_STARTED',
    );
  });

  it('qualquer escrita após SESSION_ENDED -> CLASS_ENDED', async () => {
    const { deps } = makeDeps();
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_ENDED' }, deps);
    for (const input of [
      { type: 'SESSION_STARTED' },
      { type: 'SESSION_ENDED' },
      { type: 'STEP_CHANGED', stepIndex: 1 },
      { type: 'TEACHER_NOTE', payload: { tutor: null, scope: 'LESSON' } },
    ]) {
      await expectDomain(appendTeacherEvent(teacher, 'a1', input, deps), 409, 'CLASS_ENDED');
    }
  });

  it('stepIndex fora do roteiro -> STEP_OUT_OF_RANGE', async () => {
    const { deps } = makeDeps();
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    await expectDomain(
      appendTeacherEvent(teacher, 'a1', { type: 'STEP_CHANGED', stepIndex: 3 }, deps),
      400,
      'STEP_OUT_OF_RANGE',
    );
  });

  it('SESSION_STARTED devolve [SESSION_STARTED, STEP_CHANGED] com dados do roteiro', async () => {
    const { deps } = makeDeps();
    const out = await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    expect(out.map((e) => e.type)).toEqual(['SESSION_STARTED', 'STEP_CHANGED']);
    expect(out[1].seq).toBe(out[0].seq + 1);
    expect(out[1].stepIndex).toBe(0);
    expect(out[1].payload).toEqual({ activity: 'Abertura', timeRange: '0-10', fromStepIndex: null });
  });

  it('SESSION_STARTED com roteiro vazio devolve só 1 evento', async () => {
    const { deps } = makeDeps({ script: [] });
    const out = await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    expect(out.map((e) => e.type)).toEqual(['SESSION_STARTED']);
  });

  it('sem plano de aula trata o roteiro como vazio', async () => {
    const { deps } = makeDeps({ lessonPlanId: null });
    const out = await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    expect(out).toHaveLength(1);
  });

  it('STEP_CHANGED monta o payload no servidor e ignora o do cliente', async () => {
    const { deps } = makeDeps();
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    const [ev] = await appendTeacherEvent(
      teacher,
      'a1',
      { type: 'STEP_CHANGED', stepIndex: 2, payload: { activity: 'hack' } },
      deps,
    );
    expect(ev.payload).toEqual({ activity: 'Prática', timeRange: '20-30', fromStepIndex: 0 });
  });

  it('TEACHER_NOTE grava audience TEACHER; os demais ALL', async () => {
    const { deps, rows } = makeDeps();
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    await appendTeacherEvent(teacher, 'a1', { type: 'TEACHER_NOTE', payload: { tutor: 'MUTE', scope: 'LESSON' } }, deps);
    expect(rows.map((r) => [r.type, r.audience])).toEqual([
      ['SESSION_STARTED', 'ALL'],
      ['STEP_CHANGED', 'ALL'],
      ['TEACHER_NOTE', 'TEACHER'],
    ]);
  });

  it('TEACHER_NOTE com payload inválido -> 400', async () => {
    const { deps } = makeDeps();
    await expectDomain(
      appendTeacherEvent(teacher, 'a1', { type: 'TEACHER_NOTE', payload: { scope: 'X' } }, deps),
      400,
      'INVALID_EVENT',
    );
  });

  it('SESSION_ENDED chama completeAgenda uma vez', async () => {
    const { deps, completeAgenda } = makeDeps();
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_ENDED' }, deps);
    expect(completeAgenda).toHaveBeenCalledTimes(1);
  });

  it('falha em completeAgenda não propaga e o evento fica gravado', async () => {
    const { deps, rows, completeAgenda } = makeDeps();
    completeAgenda.mockRejectedValueOnce(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    const out = await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_ENDED' }, deps);
    expect(out[0].type).toBe('SESSION_ENDED');
    expect(rows.some((r) => r.type === 'SESSION_ENDED')).toBe(true);
    spy.mockRestore();
  });

  it('5 STEP_CHANGED concorrentes geram seq únicos e crescentes', async () => {
    const { deps } = makeDeps();
    await appendTeacherEvent(teacher, 'a1', { type: 'SESSION_STARTED' }, deps);
    const results = await Promise.all(
      [1, 2, 1, 2, 1].map((i) => appendTeacherEvent(teacher, 'a1', { type: 'STEP_CHANGED', stepIndex: i }, deps)),
    );
    const seqs = results.map((r) => r[0].seq);
    expect(new Set(seqs).size).toBe(5);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
});

describe('leitura', () => {
  const question = {
    kind: 'MULTIPLE_CHOICE',
    origin: 'TUTOR',
    source: 'GENERATED',
    question: {
      id: 'q1',
      enunciation: 'Quanto é dois mais dois?',
      options: [
        { key: 'A', text: '3' },
        { key: 'B', text: '4' },
        { key: 'C', text: '5' },
        { key: 'D', text: '6' },
      ],
      correctKey: 'B',
      rationale: 'Soma simples.',
      topic: 'Aritmética',
    },
  };

  function seed(rows: ClassEventRow[]) {
    const base = { createdBy: 'TUTOR', createdAt: new Date() } as const;
    rows.push(
      { ...base, seq: 1, type: 'TUTOR_QUESTION', stepIndex: 0, payload: question, audience: 'ALL' } as ClassEventRow,
      { ...base, seq: 2, type: 'TUTOR_CARD', stepIndex: 0, payload: { bad: true }, audience: 'ALL' } as ClassEventRow,
      { ...base, seq: 3, type: 'TEACHER_NOTE', stepIndex: null, payload: { tutor: null, scope: 'LESSON' }, audience: 'TEACHER' } as ClassEventRow,
    );
  }

  it('aluno lê com audiences [ALL, id], sem correctKey; inválido é descartado com warn', async () => {
    const { deps, rows, findEventsAfter } = makeDeps();
    seed(rows);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { events, lastSeq } = await listEventsAfter(student, 'a1', 0, deps);
    expect(findEventsAfter).toHaveBeenCalledWith('a1', 0, ['ALL', 's1'], expect.any(Number));
    expect(events.map((e) => e.seq)).toEqual([1]);
    expect(JSON.stringify(events[0].payload)).not.toContain('correctKey');
    expect(warn).toHaveBeenCalled();
    expect(lastSeq).toBe(1);
    warn.mockRestore();
  });

  it('professor vê TEACHER_NOTE; lastSeq = after quando nada volta', async () => {
    const { deps, rows } = makeDeps();
    seed(rows);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await listEventsAfter(teacher, 'a1', 0, deps);
    expect(t.events.map((e) => e.seq)).toEqual([1, 3]);
    const none = await listEventsAfter(teacher, 'a1', 3, deps);
    expect(none).toEqual({ events: [], lastSeq: 3 });
    warn.mockRestore();
  });

  it('openEventReader checa escopo uma vez só', async () => {
    const { deps, rows, getAgenda } = makeDeps();
    seed(rows);
    const reader = await openEventReader(teacher, 'a1', deps);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await reader.read(0);
    await reader.read(1);
    expect(getAgenda).toHaveBeenCalledTimes(1);
  });
});
