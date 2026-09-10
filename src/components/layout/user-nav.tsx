'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, User, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AuthenticatedUser } from '@/lib/auth/types';

interface UserNavProps {
  initialUser?: AuthenticatedUser | null;
}

export function UserNav({ initialUser }: UserNavProps) {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthenticatedUser | null>(initialUser || null);
  const [loading, setLoading] = React.useState(!initialUser);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  React.useEffect(() => {
    if (!initialUser) {
      fetch('/api/v1/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) {
            setUser(data.user);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [initialUser]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await fetch('/api/v1/auth/logout', { method: 'POST' });
      setUser(null);
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
    );
  }

  if (!user) {
    return (
      <Button
        variant="default"
        size="sm"
        onClick={() => router.push('/login')}
        className="gap-2 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer shadow-sm rounded-lg"
      >
        <User className="h-4 w-4" />
        <span>Entrar</span>
      </Button>
    );
  }

  const roleLabel =
    user.role === 'ADMIN'
      ? 'Administrador'
      : user.role === 'TEACHER'
      ? 'Professor'
      : 'Aluno';

  return (
    <div className="flex items-center gap-2.5">
      <div className="hidden sm:flex flex-col items-end text-right">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-none">
            {user.name}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 font-medium bg-brand-teal/10 text-brand-teal border-brand-teal/20"
          >
            {roleLabel}
          </Badge>
        </div>
        {user.enrollment && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            Matrícula: {user.enrollment}
          </span>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        disabled={isLoggingOut}
        title="Encerrar sessão soberana"
        className="h-8 px-2.5 text-slate-500 hover:text-brand-rose dark:hover:text-brand-rose cursor-pointer transition-colors"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden md:inline text-xs ml-1">Sair</span>
      </Button>
    </div>
  );
}
