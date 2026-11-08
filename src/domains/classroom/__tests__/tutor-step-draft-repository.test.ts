import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
const executeRaw = vi.fn();
const findMany = vi.fn();
const update = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: (s: TemplateStringsArray, ...v: unknown[]) => queryRaw(s.join('?'), v),
    $executeRaw: (s: TemplateStringsArray, ...v: unknown[]) => executeRaw(s.join('?'), v),
    tutorStepDraft: { findMany: (a: never) => findMany(a), update: (a: never) => update(a) },
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

  it('claimDraft: true só com 1 linha afetada', async () => {
    expect(await claimDraft('d1')).toBe(true);
    executeRaw.mockResolvedValueOnce(0);
    expect(await claimDraft('d1')).toBe(false);
    const [sql, values] = executeRaw.mock.calls[0];
    expect(sql).toContain('calls < ');
    expect(sql).toContain('"claimedAt" IS NULL');
    expect(values).toEqual(expect.arrayContaining(['d1']));
  });

  it('spendCall: calls = calls + 1 WHERE calls < 2', async () => {
    expect(await spendCall('d1')).toBe(true);
    const [sql] = executeRaw.mock.calls[0];
    expect(sql).toContain('calls = calls + 1');
    expect(sql).toContain('calls < ');
    executeRaw.mockResolvedValueOnce(0);
    expect(await spendCall('d1')).toBe(false);
  });

  it('saveDraftContent, releaseDraft e listDrafts', async () => {
    await saveDraftContent('d1', { card: { x: 1 } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { card: { x: 1 } } });
    await releaseDraft('d1');
    expect(executeRaw.mock.calls[0][0]).toContain('"claimedAt" = NULL');
    findMany.mockResolvedValue([row]);
    expect(await listDrafts('lp1')).toEqual([row]);
    expect(findMany.mock.calls[0][0].where).toEqual({ lessonPlanId: 'lp1' });
  });
});
