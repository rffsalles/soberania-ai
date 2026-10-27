import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { lessonReadiness } from '@/domains/teaching/lesson-publish';
import { LESSON_READINESS_LABEL, LESSON_STATUS, LESSON_STATUS_LABEL } from '@/lib/constants/teaching';

type LessonBadgesInput = {
  status: string;
  classNumber: number;
  topicTitle: string;
  dailyObjective: string;
  timeScript: unknown;
};

/** Selo de status + selo de completude (derivado de lessonReadiness, mesma regra da publicação). */
export function LessonBadges({
  lesson,
  className,
  showReason,
}: {
  lesson: LessonBadgesInput;
  className?: string;
  showReason?: boolean;
}) {
  const published = lesson.status === LESSON_STATUS.PUBLISHED;
  const { ready, reason } = lessonReadiness(lesson);
  return (
    <span className={`block ${className ?? ''}`}>
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge variant={published ? 'default' : 'secondary'}>
          {published ? LESSON_STATUS_LABEL.PUBLISHED : LESSON_STATUS_LABEL.DRAFT}
        </Badge>
        {!ready && (
          <Badge variant="amber" title={reason ?? undefined}>
            {LESSON_READINESS_LABEL.INCOMPLETE}
          </Badge>
        )}
        {ready && !published && <Badge variant="success">{LESSON_READINESS_LABEL.READY}</Badge>}
      </span>
      {showReason && !ready && reason && (
        <span className="mt-0.5 block text-[11px] text-amber-600 dark:text-amber-400">{reason}</span>
      )}
    </span>
  );
}
