'use client';

import * as React from 'react';
import { UniversalSocraticChat } from '@/components/ai/universal-socratic-chat';
import type { AgendaType } from '@/domains/agendas/types';

export interface ChatMessage {
  id: string;
  sender: 'student' | 'teacher';
  text: string;
  citation?: string;
  isGuardrailViolation?: boolean;
  timestamp: string;
}

export interface SocraticChatPanelProps {
  agendaType?: AgendaType;
  sessionId?: string;
  onOpenMinutesModal?: () => void;
  className?: string;
}

export function SocraticChatPanel({
  agendaType = 'CLASSROOM',
  sessionId = 'session-live-01',
  onOpenMinutesModal,
  className,
}: SocraticChatPanelProps) {
  const mode = agendaType === 'EXAM' ? 'ASSESSMENT_EXAM' : 'CLASSROOM_STUDENT';

  return (
    <UniversalSocraticChat
      mode={mode}
      sessionId={sessionId}
      onOpenMinutesModal={onOpenMinutesModal}
      className={className}
    />
  );
}
