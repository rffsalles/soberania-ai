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

/** Rascunho devolvido por `ensureDraft`, com a reserva viva calculada no SQL (`now()`). */
export type EnsuredDraftRow = TutorDraftRow & { claimActive: boolean };

/** Prova de posse da reserva: o `claimedAt` gravado, em texto, para comparar sem perder precisão nem fuso. */
export type DraftClaim = string;

const DRAFT_SELECT = { id: true, stepIndex: true, stepHash: true, card: true, question: true, calls: true } as const;

/** Cria o rascunho do passo; hash diferente zera conteúdo, chamadas e reserva. Uma única instrução. */
export async function ensureDraft(
  lessonPlanId: string,
  stepIndex: number,
  stepHash: string,
): Promise<EnsuredDraftRow> {
  const rows = await db.$queryRaw<EnsuredDraftRow[]>`
    INSERT INTO tutor_step_drafts (id, "lessonPlanId", "stepIndex", "stepHash", calls, "updatedAt")
    VALUES (${randomUUID()}, ${lessonPlanId}, ${stepIndex}, ${stepHash}, 0, now())
    ON CONFLICT ("lessonPlanId", "stepIndex") DO UPDATE SET
      card = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN NULL ELSE tutor_step_drafts.card END,
      question = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN NULL ELSE tutor_step_drafts.question END,
      calls = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN 0 ELSE tutor_step_drafts.calls END,
      "claimedAt" = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN NULL ELSE tutor_step_drafts."claimedAt" END,
      "stepHash" = EXCLUDED."stepHash",
      "updatedAt" = CASE WHEN tutor_step_drafts."stepHash" <> EXCLUDED."stepHash" THEN now() ELSE tutor_step_drafts."updatedAt" END
    RETURNING id, "stepIndex", "stepHash", card, question, calls,
      ("claimedAt" IS NOT NULL AND "claimedAt" >= now() - make_interval(secs => ${TUTOR_CLAIM_TTL_SECONDS})) AS "claimActive"`;
  return rows[0];
}

/**
 * Reserva atômica: só com chamadas sobrando e reserva livre ou vencida.
 * Devolve a prova de posse (o `claimedAt` gravado) ou null quando não reservou.
 */
export async function claimDraft(id: string): Promise<DraftClaim | null> {
  const rows = await db.$queryRaw<{ claimedAt: string }[]>`
    UPDATE tutor_step_drafts SET "claimedAt" = now(), "updatedAt" = now()
    WHERE id = ${id} AND calls < ${TUTOR_STEP_MAX_CALLS}
      AND ("claimedAt" IS NULL OR "claimedAt" < now() - make_interval(secs => ${TUTOR_CLAIM_TTL_SECONDS}))
    RETURNING "claimedAt"::text AS "claimedAt"`;
  return rows[0]?.claimedAt ?? null;
}

/** SPENT: gastou a chamada; BUDGET: dono da reserva, teto atingido; LOST: a reserva não é mais deste worker. */
export type SpendResult = 'SPENT' | 'BUDGET' | 'LOST';

/**
 * Gasta uma das chamadas ao modelo do passo, só com a reserva em mãos. A segunda consulta roda só quando
 * nada foi gasto, para separar o teto da reserva perdida (vencida e retomada, ou zerada por hash novo).
 */
export async function spendCall(id: string, claim: DraftClaim): Promise<SpendResult> {
  const n = await db.$executeRaw`
    UPDATE tutor_step_drafts SET calls = calls + 1, "updatedAt" = now()
    WHERE id = ${id} AND "claimedAt" = ${claim}::timestamp AND calls < ${TUTOR_STEP_MAX_CALLS}`;
  if (n === 1) return 'SPENT';
  const rows = await db.$queryRaw<{ owned: boolean }[]>`
    SELECT ("claimedAt" IS NOT NULL AND "claimedAt" = ${claim}::timestamp) AS owned
    FROM tutor_step_drafts WHERE id = ${id}`;
  return rows[0]?.owned ? 'BUDGET' : 'LOST';
}

/**
 * Grava o conteúdo gerado só se a reserva ainda é deste worker e o hash do passo não mudou.
 * false = perdeu a linha (outro worker ou roteiro editado): o chamador para sem publicar.
 */
export async function saveDraftContent(
  id: string,
  claim: DraftClaim,
  stepHash: string,
  data: { card?: Prisma.InputJsonValue; question?: Prisma.InputJsonValue },
): Promise<boolean> {
  const card = data.card === undefined ? null : JSON.stringify(data.card);
  const question = data.question === undefined ? null : JSON.stringify(data.question);
  const n = await db.$executeRaw`
    UPDATE tutor_step_drafts SET
      card = COALESCE(${card}::jsonb, card),
      question = COALESCE(${question}::jsonb, question),
      "updatedAt" = now()
    WHERE id = ${id} AND "claimedAt" = ${claim}::timestamp AND "stepHash" = ${stepHash}`;
  return n === 1;
}

/** Libera só a própria reserva: se ela venceu e outro worker reservou, não mexe. */
export async function releaseDraft(id: string, claim: DraftClaim): Promise<void> {
  await db.$executeRaw`
    UPDATE tutor_step_drafts SET "claimedAt" = NULL, "updatedAt" = now()
    WHERE id = ${id} AND "claimedAt" = ${claim}::timestamp`;
}

export async function listDrafts(lessonPlanId: string): Promise<TutorDraftRow[]> {
  return db.tutorStepDraft.findMany({
    where: { lessonPlanId },
    select: DRAFT_SELECT,
    orderBy: { stepIndex: 'asc' },
  });
}
