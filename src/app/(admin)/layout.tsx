import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';

/** Área administrativa (telemetria): o header compartilhado (menu por papel e Sair) é renderizado aqui, não nas páginas. */
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
