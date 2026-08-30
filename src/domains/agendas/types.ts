export type AgendaType =
  | 'CLASSROOM'
  | 'STUDY_GROUP'
  | 'EXAM'
  | 'DRAFT_REVIEW'
  | 'OFFICE_HOURS';

export type AgendaStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export interface AgendaSession {
  id: string;
  title: string;
  subject: string;
  type: AgendaType;
  status: AgendaStatus;
  startTime: string; // ISO String
  endTime: string;   // ISO String
  videoUrl?: string;
  classId?: string;
  className?: string;
  instructorName: string;
  authorizedWindowMinutes?: number;
  createdAt?: string;
}

export interface AgendaTimeWindowValidation {
  isWithinWindow: boolean;
  minutesRemaining: number;
  timeUntilStartMinutes: number;
  message: string;
}
