// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NO_LESSON_CHAPTERS } from '@/lib/constants/teaching';
import type { LessonItem } from '@/components/teaching/use-lessons';
import { useLessonGeneration } from '../use-lesson-generation';
import { useLessonStatus } from '../use-lesson-status';

vi.mock('@/components/teaching/use-lessons', () => ({
  generateLesson: vi.fn(),
  setLessonStatus: vi.fn(),
}));

const feedback = { onStart: vi.fn(), onError: vi.fn() };

function generation(savedChapterIds: string[], selectionKey: string) {
  return renderHook(() =>
    useLessonGeneration({ ...feedback, lessonId: 'l1', savedChapterIds, selectionKey, hasContent: false, applyGenerated: vi.fn() })
  ).result.current;
}

describe('hooks de aula', () => {
  it('useLessonGeneration: sem capítulo salvo e seleção diferente dão o motivo certo', () => {
    expect(generation([], '').lockReason).toBe(NO_LESSON_CHAPTERS);
    expect(generation(['b', 'a'], 'a').lockReason).toBe('Salve os capítulos selecionados antes de gerar.');
    expect(generation(['b', 'a'], 'a,b').lockReason).toBeUndefined();
  });

  it('useLessonStatus: formulário sujo bloqueia publicar', () => {
    const { result } = renderHook(() =>
      useLessonStatus({ ...feedback, lesson: { id: 'l1', status: 'DRAFT' } as unknown as LessonItem, dirty: true, onSaved: vi.fn() })
    );
    expect(result.current.publishLock).toBe('Salve as alterações antes de publicar.');
  });
});
