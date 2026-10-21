import { describe, it, expect } from 'vitest';
import { timeScriptItemSchema, timeScriptSchema } from '../time-script';

const item = { timeSeconds: 0, timeRange: '00:00-15:00', activity: 'Acolhimento', description: 'Revisão' };

describe('time-script', () => {
  it('accepts a valid item with optional socraticQuestion', () => {
    expect(timeScriptItemSchema.safeParse(item).success).toBe(true);
    expect(timeScriptItemSchema.safeParse({ ...item, socraticQuestion: 'Por quê?' }).success).toBe(true);
  });

  it('rejects an item without timeSeconds or with an invalid value', () => {
    const { timeSeconds: _omit, ...rest } = item;
    void _omit;
    expect(timeScriptItemSchema.safeParse(rest).success).toBe(false);
    expect(timeScriptItemSchema.safeParse({ ...item, timeSeconds: -1 }).success).toBe(false);
    expect(timeScriptItemSchema.safeParse({ ...item, timeSeconds: 1.5 }).success).toBe(false);
  });

  it('bounds the script length', () => {
    expect(timeScriptSchema.safeParse(Array(61).fill(item)).success).toBe(false);
    expect(timeScriptSchema.safeParse(Array(60).fill(item)).success).toBe(true);
  });
});
