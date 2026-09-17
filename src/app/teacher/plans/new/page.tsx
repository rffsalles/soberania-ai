'use client';

import * as React from 'react';
import TeachingPlanNewPage from './_components/TeachingPlanNewPage';

export default function Page() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 text-center text-slate-500">
          Carregando formulário do plano de ensino...
        </div>
      }
    >
      <TeachingPlanNewPage />
    </React.Suspense>
  );
}

