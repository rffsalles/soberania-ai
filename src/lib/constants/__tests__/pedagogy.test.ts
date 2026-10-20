import { describe, it, expect } from 'vitest';
import { retentionColor } from '@/lib/constants/pedagogy';

describe('retentionColor', () => {
  it('classifica pelos limiares 80/50', () => {
    expect(retentionColor(81)).toBe('green');
    expect(retentionColor(80)).toBe('yellow');
    expect(retentionColor(50)).toBe('yellow');
    expect(retentionColor(49)).toBe('red');
  });
});
