'use client';

import * as React from 'react';
import { UniversalSocraticChat } from '@/components/ai/universal-socratic-chat';
import type { AgendaType } from '@/domains/agendas/types';

export interface SocraticChatPanelProps {
  agendaId: string;
  agendaType: AgendaType;
  suggestions?: string[];
  onOpenMinutesModal?: () => void;
  onGuardrailBlock?: () => void;
  onReplyDone?: () => void;
  className?: string;
  draft?: { text: string; nonce: number };
}

export function SocraticChatPanel({
  agendaId,
  agendaType,
  suggestions,
  onOpenMinutesModal,
  onGuardrailBlock,
  onReplyDone,
  className,
  draft,
}: SocraticChatPanelProps) {
  return (
    <UniversalSocraticChat
      agendaId={agendaId}
      agendaType={agendaType}
      suggestions={suggestions}
      onOpenMinutesModal={onOpenMinutesModal}
      onGuardrailBlock={onGuardrailBlock}
      onReplyDone={onReplyDone}
      className={className}
      draft={draft}
    />
  );
}
