import { OPTION_KEYS } from '@/lib/constants/assessments';
import type { Question, Rubric } from '@/domains/assessments/question-schema';

import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from '@/lib/validators/assessment.validator';

type DraftShape = {
  questions: Question[];
  rubrics: Rubric[];
  maxScore: number;
  durationMinutes: number;
};

const isPositive = (n: number) => Number.isFinite(n) && n > 0;

/** Valida o rascunho no cliente; devolve mensagens em pt-BR (vazio = válido). */
export function validateAssessmentDraft(draft: DraftShape): string[] {
  const errors: string[] = [];
  if (draft.questions.length === 0) errors.push('Adicione ao menos uma questão.');
  draft.questions.forEach((q, i) => {
    const n = i + 1;
    if (q.enunciation.trim().length < 10) errors.push(`Questão ${n}: o enunciado precisa de ao menos 10 caracteres.`);
    if (q.options.length !== OPTION_KEYS.length || q.options.some((o) => !o.text.trim())) {
      errors.push(`Questão ${n}: preencha as 4 alternativas.`);
    }
    if (!q.options.some((o) => o.key === q.correctKey)) errors.push(`Questão ${n}: marque a alternativa correta.`);
  });
  if (!isPositive(draft.maxScore)) errors.push('A nota máxima deve ser um número positivo.');
  if (
    !Number.isInteger(draft.durationMinutes) ||
    draft.durationMinutes < MIN_DURATION_MINUTES ||
    draft.durationMinutes > MAX_DURATION_MINUTES
  ) {
    errors.push(`A duração deve estar entre ${MIN_DURATION_MINUTES} e ${MAX_DURATION_MINUTES} minutos.`);
  }
  if (draft.rubrics.some((r) => !r.criterion.trim() || !Number.isFinite(r.weight))) {
    errors.push('Toda rubrica precisa de critério e peso válido.');
  }
  return errors;
}
