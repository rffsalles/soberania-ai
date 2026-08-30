'use client';

import * as React from 'react';
import ExamPage from './_components/ExamPage';

export default function Page({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const unwrappedParams = React.use(params);
  return <ExamPage examId={unwrappedParams.examId} />;
}
