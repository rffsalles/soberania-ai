'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  BarChart3,
  Server,
} from 'lucide-react';
import { TelemetryBadge } from './telemetry-badge';
import { UserNav } from './user-nav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants/routes';
import { canAccessRoute } from '@/lib/auth/rbac';
import { useCurrentUser } from './use-current-user';

export function AppHeader() {
  const pathname = usePathname();

  const { user, isLoading } = useCurrentUser();

  const allNavLinks = [
    { href: ROUTES.DASHBOARD, label: 'Painel', icon: LayoutDashboard },
    { href: ROUTES.REPORTS, label: 'Analytics Docente', icon: BarChart3 },
    { href: ROUTES.TEACHER_MATERIALS, label: 'Acervo RAG', icon: BookOpen },
    { href: ROUTES.APPLIANCE, label: 'Hardware & Telemetria', icon: Server },
  ];
  const navLinks = user ? allNavLinks.filter((link) => canAccessRoute(link.href, user.role)) : [];

  return (
    <header className="print-hidden sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5 group cursor-pointer">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-teal-dark text-white shadow-sm group-hover:scale-105 transition-transform">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-bold text-slate-900 dark:text-white tracking-tight text-lg">
                  Soberania <span className="text-brand-orange">AI</span>
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-teal/10 text-brand-teal">
                  Appliance
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Tutora Lucy · Apoio Docente On-Premises
              </p>
            </div>
          </Link>
        </div>

        {/* Global Telemetry Banner */}
        <div className="hidden lg:block">
          <TelemetryBadge role={user?.role} />
        </div>

        {/* User Role Quick Switch & Auth */}
        <div className="flex items-center gap-3">
          <UserNav initialUser={user} isLoading={isLoading} />
        </div>
      </div>

      {/* Navigation Sub-Bar */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto py-2 no-scrollbar">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== ROUTES.DASHBOARD && pathname.startsWith(link.href));
            return (
              <Link key={link.href} href={link.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 px-3 rounded-lg text-xs font-medium gap-1.5 cursor-pointer transition-colors',
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-brand-teal shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-brand-teal' : 'text-slate-400')} />
                  <span>{link.label}</span>
                </Button>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
