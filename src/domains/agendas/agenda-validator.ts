import type { AgendaSession, AgendaStatus, AgendaTimeWindowValidation } from './types';

/**
 * Valida se a requisição do aluno está dentro da janela de horário autorizada para a sessão
 */
export function validateAgendaTimeWindow(
  session: AgendaSession,
  currentTime: Date = new Date()
): AgendaTimeWindowValidation {
  if (session.status === 'CANCELLED') {
    return {
      isWithinWindow: false,
      minutesRemaining: 0,
      timeUntilStartMinutes: 0,
      message: 'Esta sessão foi cancelada pela coordenação pedagógica.',
    };
  }

  if (session.status === 'LIVE') {
    const liveEnd = new Date(session.endTime).getTime();
    if (!isNaN(liveEnd)) {
      const remaining = Math.max(0, Math.ceil((liveEnd - currentTime.getTime()) / (1000 * 60)));
      return {
        isWithinWindow: true,
        minutesRemaining: remaining,
        timeUntilStartMinutes: 0,
        message: `Sessão ativa e transmitida ao vivo. Você tem ${remaining} minuto(s) restante(s).`,
      };
    }
    return {
      isWithinWindow: true,
      minutesRemaining: session.authorizedWindowMinutes || 90,
      timeUntilStartMinutes: 0,
      message: `Sessão ativa e transmitida ao vivo. Janela de acesso liberada.`,
    };
  }

  const start = new Date(session.startTime);
  const end = new Date(session.endTime);
  const now = currentTime.getTime();

  // If valid Date objects were parsed
  if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
    const isBefore = now < start.getTime();
    const isAfter = now > end.getTime();

    if (isBefore) {
      const diffMin = Math.ceil((start.getTime() - now) / (1000 * 60));
      return {
        isWithinWindow: false,
        minutesRemaining: 0,
        timeUntilStartMinutes: diffMin,
        message: `Esta sessão iniciará em ${diffMin} minuto(s). O acesso com o agente só estará liberado às ${start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
      };
    }

    if (isAfter) {
      return {
        isWithinWindow: false,
        minutesRemaining: 0,
        timeUntilStartMinutes: 0,
        message: `Esta sessão foi encerrada às ${end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. As interações ativas foram finalizadas e a Ata Pedagógica foi emitida.`,
      };
    }

    const remainingMin = Math.ceil((end.getTime() - now) / (1000 * 60));
    return {
      isWithinWindow: true,
      minutesRemaining: remainingMin,
      timeUntilStartMinutes: 0,
      message: `Sessão ativa. Você tem ${remainingMin} minuto(s) restante(s).`,
    };
  }

  return {
    isWithinWindow: true,
    minutesRemaining: 90,
    timeUntilStartMinutes: 0,
    message: 'Sessão liberada para interação formativa.',
  };
}

/**
 * Deriva o status efetivo da agenda a partir da janela de horário.
 * CANCELLED e COMPLETED são terminais e permanecem.
 */
export function deriveAgendaStatus(
  agenda: { status: AgendaStatus; startTime: Date | string; endTime: Date | string },
  now: Date = new Date()
): AgendaStatus {
  if (agenda.status === 'CANCELLED' || agenda.status === 'COMPLETED') return agenda.status;
  const t = now.getTime();
  if (t < new Date(agenda.startTime).getTime()) return 'SCHEDULED';
  if (t > new Date(agenda.endTime).getTime()) return 'COMPLETED';
  return 'LIVE';
}
