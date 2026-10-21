import { describe, expect, it, vi } from 'vitest';
import { AgendaStatus, AgendaType, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { STUDY_GROUP_STALEMATE_MINUTES } from '@/lib/constants/tutor';
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
  const chat = vi.fn<StudyGroupDeps['chatWithTutor']>(async () => ({ reply: 'E se separarmos o cliente?' }));
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
    },
  };
  return { deps, chat, store };
}

describe('study-group-service', () => {
  it('menção à tutora grava a mensagem e uma resposta da IA', async () => {
    const { deps, chat, store } = makeDeps(makeAgenda());
    const result = await postMessage(user, AGENDA_ID, 'Ajuda por favor @Lucy', deps);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.tutorReply).toMatchObject({ isAi: true, authorId: null, authorName: 'Tutora Lucy' });
    expect(store.filter((m) => m.isAi)).toHaveLength(1);
  });

  it('sem menção não chama a tutora', async () => {
    const { deps, chat, store } = makeDeps(makeAgenda());
    const result = await postMessage(user, AGENDA_ID, 'Vamos dividir as tabelas', deps);
    expect(chat).not.toHaveBeenCalled();
    expect(result.tutorReply).toBeUndefined();
    expect(store).toHaveLength(1);
  });

  it('checkStalemate cria uma intervenção e a segunda chamada não cria outra', async () => {
    const old = makeMessage({ id: 'm1', createdAt: new Date(NOW.getTime() - (STUDY_GROUP_STALEMATE_MINUTES + 1) * MINUTE) });
    const { deps, chat, store } = makeDeps(makeAgenda(), [old]);
    const first = await checkStalemate(AGENDA_ID, user, NOW, deps);
    expect(first).toMatchObject({ isAi: true, authorId: null });
    expect(chat.mock.calls[0]?.[1].message).toContain('Normalização 3FN');
    const second = await checkStalemate(AGENDA_ID, user, NOW, deps);
    expect(second).toBeNull();
    expect(store.filter((m) => m.isAi)).toHaveLength(1);
  });

  it('checkStalemate não age com mensagem recente, grupo vazio ou agenda não LIVE', async () => {
    const recent = makeMessage({ id: 'm1', createdAt: new Date(NOW.getTime() - MINUTE) });
    expect(await checkStalemate(AGENDA_ID, user, NOW, makeDeps(makeAgenda(), [recent]).deps)).toBeNull();
    expect(await checkStalemate(AGENDA_ID, user, NOW, makeDeps(makeAgenda()).deps)).toBeNull();
    const old = makeMessage({ id: 'm2', createdAt: new Date(NOW.getTime() - HOUR) });
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
    const old = makeMessage({ id: 'm1', createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat } = makeDeps(makeAgenda(), [old]);
    await checkStalemate(AGENDA_ID, user, NOW, deps);
    expect(chat.mock.calls[0]?.[1].persistInteraction).toBe(false);
  });

  it('duas chamadas concorrentes de checkStalemate geram uma só intervenção', async () => {
    const old = makeMessage({ id: 'm1', createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat, store } = makeDeps(makeAgenda(), [old]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    chat.mockImplementation(async () => {
      await gate;
      return { reply: 'Pergunta?' };
    });
    const first = checkStalemate(AGENDA_ID, user, NOW, deps);
    await new Promise((r) => setTimeout(r, 0));
    expect(await checkStalemate(AGENDA_ID, user, NOW, deps)).toBeNull();
    release();
    expect(await first).not.toBeNull();
    expect(store.filter((m) => m.isAi)).toHaveLength(1);
  });

  it('checkStalemate aborta se chegou mensagem durante a geração', async () => {
    const old = makeMessage({ id: 'm1', createdAt: new Date(NOW.getTime() - HOUR) });
    const { deps, chat, store } = makeDeps(makeAgenda(), [old]);
    chat.mockImplementation(async () => {
      await deps.repo.createMessage({ agendaId: AGENDA_ID, authorId: 'stu-2', content: 'voltei', isAi: false });
      return { reply: 'Pergunta?' };
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

  it('menção respeita fronteira de palavra', () => {
    expect(mentionsTutor('Ei @Lucy, ajuda')).toBe(true);
    expect(mentionsTutor('@tutora')).toBe(true);
    expect(mentionsTutor('oi @luci!')).toBe(true);
    expect(mentionsTutor('fala @luciana')).toBe(false);
    expect(mentionsTutor('a@lucy.com')).toBe(false);
    expect(mentionsTutor('@lucyana')).toBe(false);
  });
});
