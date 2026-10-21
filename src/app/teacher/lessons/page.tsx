import * as React from 'react';
import { LessonsPage } from './_components/LessonsPage';

export default function TeacherLessonsPage() {
  return (
    <React.Suspense fallback={null}>
      <LessonsPage />
    </React.Suspense>
  );
}
