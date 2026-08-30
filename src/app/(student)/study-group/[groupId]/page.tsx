'use client';

import * as React from 'react';
import StudyGroupPage from './_components/StudyGroupPage';

export default function Page({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const unwrappedParams = React.use(params);
  return <StudyGroupPage groupId={unwrappedParams.groupId} />;
}
