import * as React from 'react';
import { NO_LESSON_CHAPTERS } from '@/lib/constants/teaching';
import { generateLesson } from '@/components/teaching/use-lessons';

const GENERATE_ERROR = 'Não foi possível gerar a aula. Tente novamente.';
const UNSAVED_CHAPTERS = 'Salve os capítulos selecionados antes de gerar.';
const CONFIRM_REPLACE = 'Gerar com IA substitui o conteúdo atual do formulário. Continuar?';

type Feedback = { onStart(): void; onError(message: string): void };

export function useLessonGeneration(
  args: Feedback & {
    lessonId: string;
    savedChapterIds: string[];
    selectionKey: string;
    hasContent: boolean;
    applyGenerated(data: Awaited<ReturnType<typeof generateLesson>>): void;
  }
) {
  const { lessonId, savedChapterIds, selectionKey, hasContent, applyGenerated, onStart, onError } = args;
  const [generating, setGenerating] = React.useState(false);
  const [citations, setCitations] = React.useState<string[]>([]);
  const savedKey = savedChapterIds.slice().sort().join(',');
  const lockReason =
    savedChapterIds.length === 0 ? NO_LESSON_CHAPTERS : selectionKey !== savedKey ? UNSAVED_CHAPTERS : undefined;

  async function generate() {
    if (hasContent && !window.confirm(CONFIRM_REPLACE)) return;
    setGenerating(true);
    onStart();
    try {
      const data = await generateLesson(lessonId);
      applyGenerated(data);
      setCitations(data.citations);
    } catch (err) {
      onError(err instanceof Error ? err.message : GENERATE_ERROR);
    } finally {
      setGenerating(false);
    }
  }

  return { generate, generating, citations, lockReason };
}
