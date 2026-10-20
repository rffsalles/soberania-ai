import type { AgendaActor } from '@/domains/agendas/services/agenda-service';
import { toCsv } from '@/lib/csv';
import type { TeacherStruggleHeatmap } from '../types';
import { listMinutes, type MinuteDTO, type MinuteFilter, type MinutesDeps } from './minutes-service';

export const HEATMAP_ACTIONS = {
  REVIEW: 'Revisar em aula',
  PRACTICE: 'Exercícios no grupo de estudos',
  KEEP: 'Manter cronograma',
} as const;

const REVIEW_FROM_PERCENT = 50;
const PRACTICE_FROM_PERCENT = 25;
const PERCENT = 100;
const DECIMAL_FACTOR = 10;

function suggestAction(percentage: number): string {
  if (percentage >= REVIEW_FROM_PERCENT) return HEATMAP_ACTIONS.REVIEW;
  if (percentage >= PRACTICE_FROM_PERCENT) return HEATMAP_ACTIONS.PRACTICE;
  return HEATMAP_ACTIONS.KEEP;
}

export function buildHeatmap(minutes: MinuteDTO[]): TeacherStruggleHeatmap[] {
  const allStudents = new Set(minutes.map((m) => m.studentId));
  const byTopic = new Map<string, Set<string>>();
  for (const m of minutes) {
    for (const topic of m.topicsStruggled) {
      const students = byTopic.get(topic) ?? new Set<string>();
      students.add(m.studentId);
      byTopic.set(topic, students);
    }
  }
  return [...byTopic.entries()]
    .map(([topic, students]) => {
      const strugglePercentage =
        Math.round((students.size / allStudents.size) * PERCENT * DECIMAL_FACTOR) / DECIMAL_FACTOR;
      return {
        topic,
        strugglePercentage,
        affectedStudentsCount: students.size,
        suggestedAction: suggestAction(strugglePercentage),
      };
    })
    .sort((a, b) => b.strugglePercentage - a.strugglePercentage || a.topic.localeCompare(b.topic));
}

export async function getHeatmap(
  user: AgendaActor,
  filter: MinuteFilter,
  deps?: MinutesDeps
): Promise<TeacherStruggleHeatmap[]> {
  return buildHeatmap(await listMinutes(user, filter, deps));
}

export async function exportMinutesCsv(
  user: AgendaActor,
  filter: MinuteFilter,
  deps?: MinutesDeps
): Promise<string> {
  const minutes = await listMinutes(user, filter, deps);
  return toCsv(
    minutes.map((m) => ({
      aluno: m.studentName,
      disciplina: m.subjectName,
      turma: m.className,
      sessao: m.sessionTitle,
      engajamento: m.engagementScore,
      hesitacao: m.hesitationIndex,
      perguntas: m.totalQuestionsAsked,
      desafios: m.socraticChallengesAnswered,
      topicos_dominados: m.topicsMastered,
      topicos_a_reforcar: m.topicsStruggled,
      data: m.createdAt,
    }))
  );
}
