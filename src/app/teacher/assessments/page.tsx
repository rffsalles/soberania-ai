import * as React from 'react';
import { AssessmentsPage } from './_components/AssessmentsPage';

export default function TeacherAssessmentsPage() {
  return (
    <React.Suspense fallback={null}>
      <AssessmentsPage />
    </React.Suspense>
  );
}
