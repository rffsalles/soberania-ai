import { describe, expect, it } from 'vitest';
import { stepHash } from '../tutor-step-hash';

const base = { activity: 'A', description: 'D', socraticQuestion: 'Q', timeSeconds: 0, timeRange: '0-5' };

describe('stepHash', () => {
  const h = stepHash(base, ['c1', 'c2']);
  it('muda com activity, description, socraticQuestion e capítulos', () => {
    expect(stepHash({ ...base, activity: 'B' }, ['c1', 'c2'])).not.toBe(h);
    expect(stepHash({ ...base, description: 'E' }, ['c1', 'c2'])).not.toBe(h);
    expect(stepHash({ ...base, socraticQuestion: 'R' }, ['c1', 'c2'])).not.toBe(h);
    expect(stepHash(base, ['c1', 'c3'])).not.toBe(h);
  });
  it('não muda com a ordem dos capítulos nem com timeSeconds', () => {
    expect(stepHash(base, ['c2', 'c1'])).toBe(h);
    expect(stepHash({ ...base, timeSeconds: 900, timeRange: 'x' }, ['c1', 'c2'])).toBe(h);
  });
});
