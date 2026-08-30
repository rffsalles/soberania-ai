'use client';

import * as React from 'react';
import ClassroomPage from './_components/ClassroomPage';

export default function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const unwrappedParams = React.use(params);
  return <ClassroomPage sessionId={unwrappedParams.sessionId} />;
}
