'use client';

import * as React from 'react';
import LoginPage from './_components/LoginPage';

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <LoginPage />
    </React.Suspense>
  );
}
