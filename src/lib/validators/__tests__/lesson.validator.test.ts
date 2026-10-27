import { describe, it, expect } from 'vitest';
import { lessonInputSchema } from '../lesson.validator';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

describe('lessonInputSchema', () => {
  it('chapterIds aceita 200 e rejeita 201', () => {
    expect(lessonInputSchema.safeParse({ chapterIds: ids(200) }).success).toBe(true);
    expect(lessonInputSchema.safeParse({ chapterIds: ids(201) }).success).toBe(false);
  });
});
