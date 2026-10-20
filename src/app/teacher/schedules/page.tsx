import * as React from 'react';
import { SchedulesPage } from './_components/SchedulesPage';

export default function TeacherSchedulesPage() {
  return (
    <React.Suspense fallback={null}>
      <SchedulesPage />
    </React.Suspense>
  );
}
