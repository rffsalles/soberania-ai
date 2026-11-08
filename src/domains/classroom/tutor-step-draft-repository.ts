import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export const TUTOR_STEP_MAX_CALLS = 2;
export const TUTOR_CLAIM_TTL_SECONDS = 60;

export type TutorDraftRow = {
  id: string;
  stepIndex: number;
  stepHash: string;
  card: Prisma.JsonValue | null;
  question: Prisma.JsonValue | null;
  calls: number;
};

const DRAFT_SELECT = { id: true, stepIndex: true, stepHash: true, card: true, question: true, calls: true } as const;

/** Cria o rascunho do passo; hash diferente zera conteúdo, chamadas e reserva. Uma única instrução. */
export async function ensureDraft(lessonPlanId: string, stepIndex: number, stepHash: string): Promise<TutorDraftRow> {
  const rows = await db.$queryRaw<TutorDraftRow[]>`
    INSERT INTO tutor_step_drafts (id, "lessonPlanId", "stepIndex", "stepHash", calls, "updatedAt")
    VALUES (${randomUUID()}, ${lessonPlanId}, ${stepIndex}, ${stepHash}, 0, now())
    ON CONFLICT ("lessonPlanId", "stepIndex") DO UPDATE SET
      card = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN NULL ELSE tutor_step_drafts.card END,
      question = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN NULL ELSE tutor_step_drafts.question END,
      calls = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN 0 ELSE tutor_step_drafts.calls END,
      "claimedAt" = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN NULL ELSE tutor_step_drafts."claimedAt" END,
      "stepHash" = EXCLUDED."stepHash",
      "updatedAt" = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN now() ELSE tutor_step_drafts."updatedAt" END
    RETURNING id, "stepIndex", "stepHash", card, question, calls`;
  return rows[0];
}

/** Reserva atômica: só com chamadas sobrando e reserva livre ou vencida. */
export async function claimDraft(id: string): Promise<boolean> {
  const n = await db.$executeRaw`
    UPDATE tutor_step_drafts SET "claimedAt" = now(), "updatedAt" = now()
    WHERE id = ${id} AND calls < ${TUTOR_STEP_MAX_CALLS}
      AND ("claimedAt" IS NULL OR "claimedAt" < now() - make_interval(secs => ${TUTOR_CLAIM_TTL_SECONDS}))`;
  return n === 1;
}

/** Gasta uma das chamadas ao modelo do passo; false quando o teto foi atingido. */
export async function spendCall(id: string): Promise<boolean> {
  const n = await db.$executeRaw`
    UPDATE tutor_step_drafts SET calls = calls + 1, "updatedAt" = now()
    WHERE id = ${id} AND calls < ${TUTOR_STEP_MAX_CALLS}`;
  return n === 1;
}

export async function saveDraftContent(
  id: string,
  data: { card?: Prisma.InputJsonValue; question?: Prisma.InputJsonValue },
): Promise<void> {
  await db.tutorStepDraft.update({ where: { id }, data });
}

export async function releaseDraft(id: string): Promise<void> {
  await db.$executeRaw`UPDATE tutor_step_drafts SET "claimedAt" = NULL, "updatedAt" = now() WHERE id = ${id}`;
}

export async function listDrafts(lessonPlanId: string): Promise<TutorDraftRow[]> {
  return db.tutorStepDraft.findMany({
    where: { lessonPlanId },
    select: DRAFT_SELECT,
    orderBy: { stepIndex: 'asc' },
  });
}
