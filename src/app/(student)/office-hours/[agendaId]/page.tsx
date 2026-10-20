'use client';

import * as React from 'react';
import OfficeHoursPage from './_components/OfficeHoursPage';

export default function Page({
  params,
}: {
  params: Promise<{ agendaId: string }>;
}) {
  const unwrappedParams = React.use(params);
  return <OfficeHoursPage agendaId={unwrappedParams.agendaId} />;
}
