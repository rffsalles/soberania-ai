import { describe, it, expect } from 'vitest';
import { parseRangeHeader } from '../http-range';

const SIZE = 1000;

describe('parseRangeHeader', () => {
  it('returns null when absent, malformed or multi-range', () => {
    expect(parseRangeHeader(null, SIZE)).toBeNull();
    expect(parseRangeHeader('items=0-1', SIZE)).toBeNull();
    expect(parseRangeHeader('bytes=0-1,5-6', SIZE)).toBeNull();
    expect(parseRangeHeader('bytes=-', SIZE)).toBeNull();
    expect(parseRangeHeader('bytes=9-2', SIZE)).toBeNull();
  });

  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseRangeHeader('bytes=0-99', SIZE)).toEqual({ start: 0, end: 99 });
    expect(parseRangeHeader('bytes=900-', SIZE)).toEqual({ start: 900, end: 999 });
    expect(parseRangeHeader('bytes=-100', SIZE)).toEqual({ start: 900, end: 999 });
    expect(parseRangeHeader('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('clamps the end to the file size', () => {
    expect(parseRangeHeader('bytes=990-5000', SIZE)).toEqual({ start: 990, end: 999 });
  });

  it('flags ranges starting beyond the file as unsatisfiable', () => {
    expect(parseRangeHeader('bytes=1000-', SIZE)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=-0', SIZE)).toBe('unsatisfiable');
  });
});
