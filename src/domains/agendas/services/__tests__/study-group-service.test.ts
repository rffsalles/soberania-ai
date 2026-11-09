import { describe, expect, it, vi } from 'vitest';
import { AgendaStatus, AgendaType, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { STUDY_GROUP_STALEMATE_MINUTES, STUDY_GROUP_STALEMATE_RETRY_MS } from '@/lib/constants/tutor';
import type { AgendaActor, AgendaDTO } from '../agenda-service';
import type { StudyGroupMessageRecord } from '../study-group-repository';
import { checkStalemate, listMessages, mentionsTutor, postMessage, type StudyGroupDeps } from '../study-group-service';

const NOW = new Date('2026-10-20T12:00:00Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const AGENDA_ID = 'ag-1';
const user: AgendaActor = { id: 'stu-1', role: Role.STUDENT, classId: 'class-a' };

function makeAgenda(over: Partial<AgendaDTO> = {}): AgendaDTO {
  return {
    id: AGENDA_ID,
    title: 'Normalização 3FN',
    subject: 'Banco de Dados',
    type: AgendaType.STUDY_GROUP,
    status: AgendaStatus.LIVE,
    startTime: new Date(NOW.getTime() - HOUR).toISOString(),
    endTime: new Date(NOW.getTime() + HOUR).toISOString(),
    classId: 'class-a',
    className: 'Turma A',
    teacherName: 'Prof Ana',
    ...over,
  };
}

function makeMessage(over: Partial<StudyGroupMessageRecord> & { id: string }): StudyGroupMessageRecord {
  return {
    agendaId: AGENDA_ID,
    authorId: 'stu-2',
    content: 'olá',
    isAi: false,
    createdAt: NOW,
    author: { name: 'Beatriz' },
    ...over,
  } as StudyGroupMessageRecord;
}

function makeDeps(agenda: AgendaDTO, seed: StudyGroupMessageRecord[] = []) {
  const store = [...seed];
  let seq = 0;
  const failures: Date[] = [];
  const attempts: Date[] = [];
  const chat = vi.fn<StudyGroupDeps['chatWithTutor']>(async () => ({ reply: 'E se separarmos o cliente?', fallback: false }));
  const deps: StudyGroupDeps = {
    now: () => NOW,
    getAgenda: async () => agenda,
    chatWithTutor: chat,
    repo: {
      async listMessages(_id, since) {
        return store.filter((m) => !since || m.createdAt > since);
      },
      async listRecentMessages(_id, limit) {
        return store.slice(-limit);
      },
      async createMessage(data) {
        const rec = makeMessage({
          id: `new-${++seq}`,
          ...data,
          createdAt: new Date(NOW.getTime() + seq),
          author: data.authorId ? { name: 'Lucas' } : null,
        });
        store.push(rec);
        return rec;
      },
      async findLastMessage() {
        return store.length ? store[store.length - 1] : null;
      },
      async createMessageIfLast(data, expectedLastId) {
        const last = store.length ? store[store.length - 1] : null;
        if (!last || last.id !== expectedLastId) return null;
        return deps.repo.createMessage(data);
      },
    },
    stalemate: {
      async claim(_id, expectedLastMessageId, retryMs, now) {
        const last = store.length ? store[store.length - 1] : null;
        if (last?.id !== expectedLastMessageId) return false;
        const prev = attempts.length ? attempts[attempts.length - 1] : null;
        if (prev && now.getTime() - prev.getTime() < retryMs) return false;
        attempts.push(now);
        return true;
      },
      async recordFailure() {
        failures.push(deps.now());
      },
    },
  };
  return { deps, chat, store, failures };
}

describe('study-group-service', () => {
  it('menção à tutora grava a mensagem e uma resposta da IA', async () => {
    const { deps, chat, store } = makeDeps(makeAgenda());
    const result = await postMessage(user, AGENDA_ID, 'Ajuda por favor @Lucy', deps);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.tutorReply).toMatchObject({ isAi: true, authorId: null, authorName: 'Tutora Lucy' });
    expect(store.filter((m) => m.isAi)).toHaveLength(1);
  });

  it('menção com o provedor em fallback não grava mensagem da IA', async () => {
    const { deps, chat, store } = makeDeps(makeAgenda());
    chat.mockResolvedValue({ reply: 'aviso de indisponibilidade', fallback: true });
    const result = await postMessage(user, AGENDA_ID, 'Ajuda @lucy', deps);
    expect(result.tutorReply).toBeUndefined();
    expect(result.tutorUnavailable).toBe(true);
    expect(store.filter((m) => m.isAi)).toHaveLength(0);
  });

  it('intervenção por silêncio com o provedor em fallback registra falha e não grava mensagem da IA', async () => {
    const last = makeMessage({ id: 'm1', authorId: user.id, createdAt: new Date(NOW.getTime() - (STUDY_GROUP_STALEMATE_MINUTES + 1) * MINUTE) });
    const { deps, chat, store, failures } = makeDeps(makeAgenda(), [last]);
    chat.mockResolvedValue({ reply: 'aviso', fallback: true });
    expect(await checkStalemate(AGENDA_ID, user, NOW, deps)).toBeNull();
    expect(store.filter((m) => m.isAi)).toHaveLength(0);
    expect(failures).toHaveLength(1);
  });

  it('sem menção não chama a tutora', async () => {
    const { deps, chat, store } = makeDeps(makeAgenda());
    const result = await postMessage(user, AGENDA_ID, 'Vamos dividir as tabelas', deps);
    expect(chat).not.toHaveBeenCalled();
    expect(result.tutorReply).toBeUndefined();
    expect(result.tutorUnavailable).toBeUndefined();
    expect(store).toHaveLength(1);
  });

  it('checkStalemate cria uma intervenção e a segunda chamada não cria outra', async () => {
    const old = makeMessage({ id: 'm1', authorId: user.id, createdAt: new Date(NOW.getTime() - (STUDY_GROUP_STALEMATE_MINUTES + 1) * MINUTE) });
    const { deps, chat, store } = makeDeps(makeAgenda(), [old]);
    const first = await checkStalemate(AGENDA_ID, user, NOW, deps);
    expect(first).toMatchObject({ isAi: true, authorId: null });
    expect(chat.mock.calls[0]?.[1].message).toContain('Normalização 3FN');
    const second = await checkStalemate(AGENDA_ID, user, NOW, deps);
    expect(second).toBeNull();
    expect(store.filter((m) => m.isAi)).toHaveLength(1);
  });

  it('checkStalemate não age com mensagem recente, grupo vazio ou agenda não LIVE', async () => {
    const recent = makeMessage({ id: 'm1', authorId: user.id, createdAt: new Date(NOW.getTime() - MINUTE) });
    expect(await checkStalemate(AGENDA_ID, user, NOW, makeDeps(makeAgenda(), [recent]).deps)).toBeNull();
    expect(await checkStalemate(AGENDA_ID, user, NOW, makeDeps(makeAgenda()).deps)).toBeNull();
    const old = makeMessage({ id: 'm2', authorId: user.id, createdAt: new Date(NOW.getTime() - HOUR) });
    const scheduled = makeAgenda({ status: AgendaStatus.SCHEDULED });
    expect(await checkStalemate(AGENDA_ID, user, NOW, makeDeps(scheduled, [old]).deps)).toBeNull();
  });

  it('agenda que não é grupo de estudos responde 404', async () => {
    const { deps } = makeDeps(makeAgenda({ type: AgendaType.CLASSROOM }));
    await expect(listMessages(user, AGENDA_ID, undefined, deps)).rejects.toMatchObject({ status: 404 });
    await expect(postMessage(user, AGENDA_ID, 'oi', deps)).rejects.toBeInstanceOf(DomainError);
  });

  it('postar com a janela fechada responde 422, mas ler é permitido', async () => {
    const closed = makeAgenda({
      status: AgendaStatus.COMPLETED,
      startTime: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
      endTime: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
    });
    const { deps, store } = makeDeps(closed, [makeMessage({ id: 'm1' })]);
    await expect(postMessage(user, AGENDA_ID, 'oi', deps)).rejects.toMatchObject({ status: 422 });
    expect(store).toHaveLength(1);
    expect(await listMessages(user, AGENDA_ID, undefined, deps)).toHaveLength(1);
  });

  it('intervenção por silêncio não grava interação do aluno', async () => {
    const old = makeMessage({ id: 'm1', authorId: user.id, createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat } = makeDeps(makeAgenda(), [old]);
    await checkStalemate(AGENDA_ID, user, NOW, deps);
    expect(chat.mock.calls[0]?.[1].persistInteraction).toBe(false);
  });

  it('duas chamadas concorrentes de checkStalemate geram uma só intervenção', async () => {
    const old = makeMessage({ id: 'm1', authorId: user.id, createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat, store } = makeDeps(makeAgenda(), [old]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    chat.mockImplementation(async () => {
      await gate;
      return { reply: 'Pergunta?', fallback: false };
    });
    const first = checkStalemate(AGENDA_ID, user, NOW, deps);
    const second = checkStalemate(AGENDA_ID, user, NOW, deps);
    await new Promise((r) => setTimeout(r, 0));
    release();
    const results = await Promise.all([first, second]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(store.filter((m) => m.isAi)).toHaveLength(1);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('três leitores após o prazo: chat chamado exatamente 1 vez e 1 mensagem da IA', async () => {
    const old = makeMessage({ id: 'm1', authorId: 'stu-9', createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat, store } = makeDeps(makeAgenda(), [old]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    chat.mockImplementation(async () => {
      await gate;
      return { reply: 'Pergunta?', fallback: false };
    });
    const readers = ['u1', 'u2', 'u3'].map((id) =>
      checkStalemate(AGENDA_ID, { ...user, id }, NOW, deps),
    );
    await new Promise((r) => setTimeout(r, 0));
    release();
    const results = await Promise.all(readers);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(store.filter((m) => m.isAi)).toHaveLength(1);
  });

  it('checkStalemate aborta se chegou mensagem durante a geração', async () => {
    const old = makeMessage({ id: 'm1', authorId: user.id, createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat, store } = makeDeps(makeAgenda(), [old]);
    chat.mockImplementation(async () => {
      await deps.repo.createMessage({ agendaId: AGENDA_ID, authorId: 'stu-2', content: 'voltei', isAi: false });
      return { reply: 'Pergunta?', fallback: false };
    });
    expect(await checkStalemate(AGENDA_ID, user, NOW, deps)).toBeNull();
    expect(store.filter((m) => m.isAi)).toHaveLength(0);
  });

  it('falha da tutora após a mensagem salva não derruba o envio', async () => {
    const { deps, chat, store } = makeDeps(makeAgenda());
    chat.mockRejectedValue(new Error('provider fora'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await postMessage(user, AGENDA_ID, '@lucy ajuda', deps);
    warn.mockRestore();
    expect(result.message.content).toBe('@lucy ajuda');
    expect(result.tutorReply).toBeUndefined();
    expect(store).toHaveLength(1);
  });

  it('após falha, aguarda a janela pelo evento antes de tentar de novo', async () => {
    const old = makeMessage({ id: 'm1', authorId: user.id, createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat, store, failures } = makeDeps(makeAgenda(), [old]);
    chat.mockRejectedValueOnce(new Error('provider fora'));
    await expect(checkStalemate(AGENDA_ID, user, NOW, deps)).rejects.toThrow('provider fora');
    expect(failures).toHaveLength(1);
    expect(await checkStalemate(AGENDA_ID, user, NOW, deps)).toBeNull();
    expect(chat).toHaveBeenCalledTimes(1);
    const later = new Date(NOW.getTime() + STUDY_GROUP_STALEMATE_RETRY_MS + 1000);
    expect(await checkStalemate(AGENDA_ID, user, later, deps)).not.toBeNull();
    expect(chat).toHaveBeenCalledTimes(2);
    expect(store.filter((m) => m.isAi)).toHaveLength(1);
  });

  it('não autor espera a carência antes de intervir', async () => {
    const early = makeMessage({ id: 'm1', authorId: 'stu-2', createdAt: new Date(NOW.getTime() - 5 * MINUTE - 30_000) });
    const a = makeDeps(makeAgenda(), [early]);
    expect(await checkStalemate(AGENDA_ID, user, NOW, a.deps)).toBeNull();
    expect(a.chat).not.toHaveBeenCalled();
    const late = makeMessage({ id: 'm1', authorId: 'stu-2', createdAt: new Date(NOW.getTime() - 6 * MINUTE - 1000) });
    const b = makeDeps(makeAgenda(), [late]);
    expect(await checkStalemate(AGENDA_ID, user, NOW, b.deps)).not.toBeNull();
  });

  it('falha ao registrar a falha não troca o erro original', async () => {
    const old = makeMessage({ id: 'm1', authorId: user.id, createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat } = makeDeps(makeAgenda(), [old]);
    chat.mockRejectedValue(new Error('provider fora'));
    deps.stalemate.recordFailure = async () => {
      throw new Error('banco fora');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(checkStalemate(AGENDA_ID, user, NOW, deps)).rejects.toThrow('provider fora');
    warn.mockRestore();
  });

  it('menção respeita fronteira de palavra', () => {
    expect(mentionsTutor('Ei @Lucy, ajuda')).toBe(true);
    expect(mentionsTutor('@tutora')).toBe(true);
    expect(mentionsTutor('oi @luci!')).toBe(true);
    expect(mentionsTutor('fala @luciana')).toBe(false);
    expect(mentionsTutor('a@lucy.com')).toBe(false);
    expect(mentionsTutor('@lucyana')).toBe(false);
  });
});
