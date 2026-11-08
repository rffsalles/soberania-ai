import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
const executeRaw = vi.fn();
const findMany = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: (s: TemplateStringsArray, ...v: unknown[]) => queryRaw(s.join('?'), v),
    $executeRaw: (s: TemplateStringsArray, ...v: unknown[]) => executeRaw(s.join('?'), v),
    tutorStepDraft: { findMany: (a: never) => findMany(a) },
  },
}));

import {
  TUTOR_CLAIM_TTL_SECONDS,
  TUTOR_STEP_MAX_CALLS,
  claimDraft,
  ensureDraft,
  listDrafts,
  releaseDraft,
  saveDraftContent,
  spendCall,
} from '../tutor-step-draft-repository';

const row = { id: 'd1', stepIndex: 0, stepHash: 'h', card: null, question: null, calls: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([row]);
  executeRaw.mockResolvedValue(1);
});

describe('tutor-step-draft-repository', () => {
  it('constantes', () => {
    expect(TUTOR_STEP_MAX_CALLS).toBe(2);
    expect(TUTOR_CLAIM_TTL_SECONDS).toBe(60);
  });

  it('ensureDraft: um único INSERT ... ON CONFLICT que zera com hash diferente', async () => {
    const r = await ensureDraft('lp1', 0, 'h');
    expect(r).toEqual(row);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [sql, values] = queryRaw.mock.calls[0];
    expect(sql).toContain('INSERT INTO tutor_step_drafts');
    expect(sql).toContain('ON CONFLICT ("lessonPlanId", "stepIndex") DO UPDATE');
    expect(sql).toContain('RETURNING');
    expect(sql).toContain('now()');
    expect(sql).toMatch(/"stepHash" <> EXCLUDED."stepHash"/);
    expect(sql).toContain('"claimedAt" = CASE');
    expect(sql).toContain('calls = CASE');
    expect(values).toEqual(expect.arrayContaining(['lp1', 0, 'h']));
    expect(values.some((v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v))).toBe(true);
  });

  it('ensureDraft devolve claimActive calculado no SQL', async () => {
    await ensureDraft('lp1', 0, 'h');
    const [sql, values] = queryRaw.mock.calls[0];
    expect(sql).toContain('AS "claimActive"');
    expect(values).toContain(TUTOR_CLAIM_TTL_SECONDS);
  });

  it('claimDraft: devolve o claimedAt reservado ou null', async () => {
    queryRaw.mockResolvedValueOnce([{ claimedAt: '2026-11-08 10:00:00.123' }]);
    expect(await claimDraft('d1')).toBe('2026-11-08 10:00:00.123');
    queryRaw.mockResolvedValueOnce([]);
    expect(await claimDraft('d1')).toBeNull();
    const [sql, values] = queryRaw.mock.calls[0];
    expect(sql).toContain('calls < ');
    expect(sql).toContain('"claimedAt" IS NULL');
    expect(sql).toContain('RETURNING "claimedAt"::text');
    expect(values).toEqual(expect.arrayContaining(['d1']));
  });

  it('spendCall: calls + 1 só com a reserva em mãos e calls < 2', async () => {
    const claim = '2026-11-08 10:00:00.123';
    expect(await spendCall('d1', claim)).toBe('SPENT');
    const [sql, values] = executeRaw.mock.calls[0];
    expect(sql).toContain('calls = calls + 1');
    expect(sql).toContain('AND "claimedAt" = ?::timestamp');
    expect(sql).toContain('calls < ');
    expect(values).toEqual(['d1', claim, TUTOR_STEP_MAX_CALLS]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('spendCall sem gastar: BUDGET se a reserva é dele, LOST se não', async () => {
    executeRaw.mockResolvedValue(0);
    queryRaw.mockResolvedValueOnce([{ owned: true }]);
    expect(await spendCall('d1', 'c')).toBe('BUDGET');
    queryRaw.mockResolvedValueOnce([{ owned: false }]);
    expect(await spendCall('d1', 'c')).toBe('LOST');
    queryRaw.mockResolvedValueOnce([]);
    expect(await spendCall('d1', 'c')).toBe('LOST');
    const [sql, values] = queryRaw.mock.calls[0];
    expect(sql).toContain('"claimedAt" = ?::timestamp');
    expect(values).toEqual(['c', 'd1']);
  });

  it('saveDraftContent: exige reserva e hash; false quando perdeu a linha', async () => {
    expect(await saveDraftContent('d1', 'c', 'h', { card: { x: 1 } })).toBe(true);
    const [sql, values] = executeRaw.mock.calls[0];
    expect(sql).toContain('card = COALESCE(?::jsonb, card)');
    expect(sql).toContain('question = COALESCE(?::jsonb, question)');
    expect(sql).toContain('AND "claimedAt" = ?::timestamp AND "stepHash" = ?');
    expect(values).toEqual([JSON.stringify({ x: 1 }), null, 'd1', 'c', 'h']);
    executeRaw.mockResolvedValueOnce(0);
    expect(await saveDraftContent('d1', 'c', 'h', { question: { q: 1 } })).toBe(false);
    expect(executeRaw.mock.calls[1][1]).toEqual([null, JSON.stringify({ q: 1 }), 'd1', 'c', 'h']);
  });

  it('releaseDraft e listDrafts', async () => {
    await releaseDraft('d1', '2026-11-08 10:00:00.123');
    const [releaseSql, releaseValues] = executeRaw.mock.calls[0];
    expect(releaseSql).toContain('"claimedAt" = NULL');
    expect(releaseSql).toContain('AND "claimedAt" = ?::timestamp');
    expect(releaseValues).toEqual(['d1', '2026-11-08 10:00:00.123']);
    findMany.mockResolvedValue([row]);
    expect(await listDrafts('lp1')).toEqual([row]);
    expect(findMany.mock.calls[0][0].where).toEqual({ lessonPlanId: 'lp1' });
  });
});
