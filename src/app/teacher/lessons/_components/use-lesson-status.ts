import * as React from 'react';
import { LESSON_STATUS } from '@/lib/constants/teaching';
import { publishBlockReason } from '@/domains/teaching/lesson-publish';
import { setLessonStatus, type LessonItem } from '@/components/teaching/use-lessons';

const STATUS_ERROR = 'Não foi possível alterar a situação da aula. Tente novamente.';
const UNSAVED_PUBLISH = 'Salve as alterações antes de publicar.';

type Feedback = { onStart(): void; onError(message: string): void };

export function useLessonStatus(args: Feedback & { lesson: LessonItem; dirty: boolean; onSaved(): void }) {
  const { lesson, dirty, onSaved, onStart, onError } = args;
  const [changing, setChanging] = React.useState(false);
  const publishLock = dirty ? UNSAVED_PUBLISH : publishBlockReason(lesson);

  async function changeStatus() {
    setChanging(true);
    onStart();
    try {
      const published = lesson.status === LESSON_STATUS.PUBLISHED;
      await setLessonStatus(lesson.id, published ? LESSON_STATUS.DRAFT : LESSON_STATUS.PUBLISHED);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : STATUS_ERROR);
    } finally {
      setChanging(false);
    }
  }

  return { changeStatus, changing, publishLock };
}
