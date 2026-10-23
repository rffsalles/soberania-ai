import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';

/** Área administrativa (/admin): o header compartilhado (menu por papel e Sair) é renderizado aqui, não nas páginas. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
