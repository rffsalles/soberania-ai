import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';

/** Área docente (/teacher): o header compartilhado (menu por papel e Sair) é renderizado aqui, não nas páginas. */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
