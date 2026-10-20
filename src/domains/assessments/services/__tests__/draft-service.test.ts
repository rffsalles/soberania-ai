import { describe, expect, it, vi } from 'vitest';
import { AgendaType, Role } from '@prisma/client';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { DEFAULT_DRAFT_RUBRIC, DRAFT_FALLBACK_SCORE, DRAFT_MAX_CHARS, DRAFT_MIN_CHARS } from '@/lib/constants/assessments';
import { listMyDrafts, submitDraft, type DraftDeps } from '../draft-service';

const student = { id: 's1', role: Role.STUDENT, classId: 'c1' };
const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const START = new Date('2026-10-20T10:00:00Z');
const END = new Date('2026-10-20T12:00:00Z');
const INSIDE = new Date('2026-10-20T11:00:00Z');
const AFTER = new Date('2026-10-20T13:00:00Z');
const LONG_TEXT = 'Normalização reduz redundância (SILBERSCHATZ, 2020). '.repeat(10).trim();

function makeDeps(opts: { now?: Date; assessmentId?: string; rubrics?: unknown; type?: AgendaType } = {}) {
  const agenda = {
    id: 'ag1',
    title: 'Orientação',
    subject: 'BD',
    type: opts.type ?? AgendaType.DRAFT_REVIEW,
    status: 'LIVE',
    startTime: START.toISOString(),
    endTime: END.toISOString(),
    classId: 'c1',
    className: 'Turma',
    teacherName: 'Prof',
    ...(opts.assessmentId ? { assessmentId: opts.assessmentId } : {}),
  } as AgendaDTO;
  const createDraft = vi.fn(async (data: { content: string }) => ({ id: 'd1', createdAt: INSIDE, ...data }));
  const parseFile = vi.fn(async () => LONG_TEXT);
  const streamChat = vi.fn(async function* () {
    yield { token: 'sem json', isComplete: true, fallback: true };
  });
  const deps: DraftDeps = {
    getAgenda: async () => agenda,
    findRubrics: async () => (opts.rubrics === undefined ? null : { rubrics: opts.rubrics }),
    createDraft,
    listDrafts: async () => [],
    streamChat,
    parseFile,
    now: () => opts.now ?? INSIDE,
  };
  return { deps, createDraft, parseFile };
}

describe('submitDraft', () => {
  it('rejeita texto com menos de 200 caracteres (400)', async () => {
    const { deps } = makeDeps();
    const short = 'x'.repeat(DRAFT_MIN_CHARS - 1);
    await expect(submitDraft(student, { agendaId: 'ag1', content: short }, deps)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('usa a rubrica padrão de 3 critérios quando a agenda não tem avaliação', async () => {
    const { deps, createDraft } = makeDeps();
    const result = await submitDraft(student, { agendaId: 'ag1', content: LONG_TEXT }, deps);
    expect(result.rubricScores).toHaveLength(DEFAULT_DRAFT_RUBRIC.length);
    expect(result.rubricScores.map((r) => r.criterion)).toEqual(DEFAULT_DRAFT_RUBRIC.map((r) => r.criterion));
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ agendaId: 'ag1', studentId: 's1', content: LONG_TEXT })
    );
  });

  it('usa as rubricas da avaliação vinculada', async () => {
    const rubrics = [{ criterion: 'Argumentação', description: 'x', weight: 2 }];
    const { deps } = makeDeps({ assessmentId: 'as1', rubrics });
    const result = await submitDraft(student, { agendaId: 'ag1', content: LONG_TEXT }, deps);
    expect(result.rubricScores.map((r) => r.criterion)).toEqual(['Argumentação']);
  });

  it('converte o arquivo .docx antes de avaliar', async () => {
    const { deps, parseFile, createDraft } = makeDeps();
    const buffer = Buffer.from('docx');
    await submitDraft(student, { agendaId: 'ag1', file: { buffer, name: 'trabalho.docx' } }, deps);
    expect(parseFile).toHaveBeenCalledWith(buffer, 'trabalho.docx');
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ content: LONG_TEXT }));
  });

  it('nega professor (403)', async () => {
    const { deps } = makeDeps();
    await expect(submitDraft(teacher, { agendaId: 'ag1', content: LONG_TEXT }, deps)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('nega envio fora da janela (422)', async () => {
    const { deps } = makeDeps({ now: AFTER });
    await expect(submitDraft(student, { agendaId: 'ag1', content: LONG_TEXT }, deps)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('retorna 404 para agenda de outro tipo', async () => {
    const { deps } = makeDeps({ type: AgendaType.EXAM });
    await expect(submitDraft(student, { agendaId: 'ag1', content: LONG_TEXT }, deps)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('submitDraft com IA', () => {
  const aiReply = (json: string, fallback = false) =>
    async function* () {
      yield { token: json, isComplete: true, fallback };
    };

  it('limita nota a 10, descarta critério inventado e preenche faltante', async () => {
    const { deps } = makeDeps();
    const reply = `Segue:\n\`\`\`json\n${JSON.stringify({
      feedback: 'Bom texto.',
      rubricScores: [
        { criterion: ' coesão ', score: 11, comment: 'Ótima' },
        { criterion: 'Inventado', score: 9, comment: 'x' },
        { criterion: 'Fontes', score: '7.26', comment: 'Ok' },
      ],
    })}\n\`\`\``;
    const result = await submitDraft(student, { agendaId: 'ag1', content: LONG_TEXT }, {
      ...deps,
      streamChat: aiReply(reply),
    });
    expect(result.feedback).toBe('Bom texto.');
    expect(result.rubricScores).toEqual([
      { criterion: 'Coesão', score: 10, comment: 'Ótima' },
      expect.objectContaining({ criterion: 'Coerência', score: DRAFT_FALLBACK_SCORE }),
      { criterion: 'Fontes', score: 7.3, comment: 'Ok' },
    ]);
  });

  it('usa o fallback quando o JSON é inválido', async () => {
    const { deps } = makeDeps();
    const result = await submitDraft(student, { agendaId: 'ag1', content: LONG_TEXT }, {
      ...deps,
      streamChat: aiReply('{ não é json }'),
    });
    expect(result.rubricScores.every((r) => r.score === DRAFT_FALLBACK_SCORE)).toBe(true);
  });

  it('rejeita texto acima do limite (400)', async () => {
    const { deps } = makeDeps();
    const huge = 'x'.repeat(DRAFT_MAX_CHARS + 1);
    await expect(submitDraft(student, { agendaId: 'ag1', content: huge }, deps)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('listMyDrafts', () => {
  it('lista apenas os rascunhos do próprio aluno', async () => {
    const { deps } = makeDeps();
    const listDrafts = vi.fn(async () => []);
    await listMyDrafts(student, 'ag1', { ...deps, listDrafts });
    expect(listDrafts).toHaveBeenCalledWith('ag1', 's1');
  });
});
