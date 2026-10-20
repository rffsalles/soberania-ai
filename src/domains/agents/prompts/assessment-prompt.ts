import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';
import { questionSchema, rubricSchema, type Question, type Rubric } from '@/domains/assessments/question-schema';
import type { DidacticChunk } from '@/domains/rag/types';

export const ASSESSMENT_SYSTEM_PROMPT = `
Você é a Tutora Lucy elaborando uma prova de múltipla escolha para o Professor Responsável.
Use SOMENTE o contexto fornecido. Responda APENAS com um objeto JSON no formato:
{"questions":[{"id":"q1","enunciation":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctKey":"A","rationale":"...","topic":"..."}],"rubrics":[{"criterion":"...","description":"...","weight":1}]}
Cada questão tem exatamente 4 alternativas (A a D) e uma única correta.
`;

export type AssessmentUnit = { unitNumber: number; title: string; topics: string[] };

export type AssessmentPromptInput = {
  syllabus: string;
  units: AssessmentUnit[];
  chunks: DidacticChunk[];
  questionCount: number;
  type: string;
};

export function buildAssessmentMessages(input: AssessmentPromptInput): AIMessage[] {
  const units = input.units
    .map((u) => `Unidade ${u.unitNumber} - ${u.title}: ${u.topics.join('; ')}`)
    .join('\n');
  const context = input.chunks.map((c, i) => `[${i + 1}] (${c.chapter}) ${c.content}`).join('\n');
  const user = `Ementa: ${input.syllabus}\n\nUnidades:\n${units}\n\nContexto:\n${context}\n\nElabore ${input.questionCount} questões (${input.type}).`;
  return [
    { role: 'system', content: ASSESSMENT_SYSTEM_PROMPT.trim() },
    { role: 'user', content: user },
  ];
}

const aiResponseSchema = z.object({
  questions: z.array(questionSchema),
  rubrics: z.array(rubricSchema).default([]),
});

/** Extrai o primeiro objeto JSON do texto e valida; null quando ausente ou inválido. */
export function parseAssessmentText(raw: string): { questions: Question[]; rubrics: Rubric[] } | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = aiResponseSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
