'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { AuthenticatedUser } from '@/lib/auth/types';

interface CurrentUserState {
  user: AuthenticatedUser | null;
  isLoading: boolean;
}

/** Carrega o usuário autenticado a partir de /api/v1/auth/me. */
export function useCurrentUser(
  initialUser?: AuthenticatedUser | null,
  enabled = true,
): CurrentUserState {
  const [user, setUser] = React.useState<AuthenticatedUser | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = React.useState(enabled && !initialUser);

  React.useEffect(() => {
    if (!enabled || initialUser) return;
    let cancelled = false;
    fetch(API_ROUTES.AUTH_ME)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialUser, enabled]);

  return { user, isLoading };
}
