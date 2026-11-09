import {
  STUDY_GROUP_STALEMATE_GRACE_MS,
  STUDY_GROUP_STALEMATE_MINUTES,
  STUDY_GROUP_STALEMATE_RETRY_MS,
  STUDY_GROUP_STALEMATE_TIMER_SLACK_MS,
} from '@/lib/constants/tutor';

export type StalemateMessage = { authorId: string | null; isAi: boolean; createdAt: Date | string };

/** Instante (ms) a partir do qual a intervenção é devida para este leitor; null se a última é da IA. */
export function stalemateDueAt(last: StalemateMessage, viewerId: string): number | null {
  if (last.isAi) return null;
  const grace = viewerId === last.authorId ? 0 : STUDY_GROUP_STALEMATE_GRACE_MS;
  return new Date(last.createdAt).getTime() + STUDY_GROUP_STALEMATE_MINUTES * 60_000 + grace;
}

export function isStalemateDue(last: StalemateMessage, viewerId: string, now: number): boolean {
  const due = stalemateDueAt(last, viewerId);
  return due !== null && now > due;
}

/** Quando o cliente deve checar de novo: logo após o prazo, ou após a espera de nova tentativa se já venceu. */
export function nextStalemateCheckAt(last: StalemateMessage, viewerId: string, now: number): number | null {
  const due = stalemateDueAt(last, viewerId);
  if (due === null) return null;
  return now <= due ? due + STUDY_GROUP_STALEMATE_TIMER_SLACK_MS : now + STUDY_GROUP_STALEMATE_RETRY_MS;
}
