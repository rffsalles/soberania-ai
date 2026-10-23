'use client';

import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { ApplianceStatus } from '@/domains/telemetry/services/telemetry-service';

/** Estado real do provedor de inferência (telemetria do appliance); null enquanto carrega ou sem acesso. */
export function useApplianceStatus(enabled = true): ApplianceStatus | null {
  const [status, setStatus] = React.useState<ApplianceStatus | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(API_ROUTES.APPLIANCE_TELEMETRY)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.status) setStatus(data.status as ApplianceStatus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return status;
}
