'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { DEMO_CREDENTIALS } from '@/lib/constants/demo-credentials';

type DemoRole = (typeof DEMO_CREDENTIALS)[number]['role'];

const SHORTCUTS: { role: DemoRole; label: string }[] = [
  { role: 'STUDENT', label: 'Aluno' },
  { role: 'TEACHER', label: 'Professor' },
  { role: 'ADMIN', label: 'Admin' },
];

/** Atalhos com as credenciais do seed. Renderizado só com NEXT_PUBLIC_DEMO_MODE=true. */
export function DemoShortcuts({ onFill }: { onFill: (identifier: string, password: string) => void }) {
  const fill = (role: DemoRole) => {
    const demo = DEMO_CREDENTIALS.find((u) => u.role === role);
    if (demo) onFill(demo.enrollment, demo.password);
  };

  return (
    <div className="mt-6 pt-5 border-t border-slate-800/80">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
        Atalhos para Demonstração / Avaliação:
      </p>
      <div className="grid grid-cols-3 gap-2">
        {SHORTCUTS.map(({ role, label }) => (
          <Button
            key={role}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fill(role)}
            className="text-[11px] h-8 border-slate-800 bg-slate-800/40 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer rounded-lg"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
