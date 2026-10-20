'use client';

import * as React from 'react';
import DraftReviewPage from './_components/DraftReviewPage';

export default function Page({
  params,
}: {
  params: Promise<{ agendaId: string }>;
}) {
  const unwrappedParams = React.use(params);
  return <DraftReviewPage agendaId={unwrappedParams.agendaId} />;
}
