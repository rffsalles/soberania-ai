'use client';

import * as React from 'react';
import { UniversalSocraticChat } from '@/components/ai/universal-socratic-chat';
import type { AgendaType } from '@/domains/agendas/types';

export interface SocraticChatPanelProps {
  agendaId: string;
  agendaType: AgendaType;
  onOpenMinutesModal?: () => void;
  className?: string;
}

export function SocraticChatPanel({
  agendaId,
  agendaType,
  onOpenMinutesModal,
  className,
}: SocraticChatPanelProps) {
  return (
    <UniversalSocraticChat
      agendaId={agendaId}
      agendaType={agendaType}
      onOpenMinutesModal={onOpenMinutesModal}
      className={className}
    />
  );
}
