import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';

/** Área docente (relatórios): o header compartilhado (menu por papel e Sair) é renderizado aqui, não nas páginas. */
export default function TeacherGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
