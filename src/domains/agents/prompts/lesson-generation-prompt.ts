import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';
import type { DidacticChunk } from '@/domains/rag/types';
import { formatCitation } from '@/domains/rag/hybrid-search';
import type { TimeScriptItem } from '@/domains/teaching/time-script';
import type { GenerationLesson } from '@/domains/teaching/services/lesson-plan-repository';

export const LESSON_GENERATION_SYSTEM_PROMPT = `
Você é a Tutora Lucy auxiliando o Professor Responsável a preparar uma aula a partir dos capítulos dos livros do plano de ensino.
Regras:
- Baseie-se nos trechos fornecidos; não invente conteúdo que eles não sustentem.
- "dailyObjective": um objetivo claro e mensurável para a aula.
- "methodology": como a aula será conduzida, em um parágrafo.
- "resourcesNeeded": lista curta de recursos necessários.
- "fixationExercise": um exercício de fixação coerente com o conteúdo.
- "steps": o roteiro em etapas sequenciais, cada uma com "durationMinutes" inteiro; a soma deve ser a duração da aula.
- "socraticQuestion" é opcional e deve instigar o raciocínio do aluno.
Responda APENAS com um objeto JSON no formato:
{"dailyObjective":"...","methodology":"...","resourcesNeeded":["..."],"fixationExercise":"...","steps":[{"activity":"...","description":"...","durationMinutes":20,"socraticQuestion":"..."}]}
`;

export type GeneratedStep = { activity: string; description: string; durationMinutes: number; socraticQuestion?: string };
export type GeneratedLessonText = {
  dailyObjective: string;
  methodology: string;
  resourcesNeeded: string[];
  fixationExercise: string;
  steps: GeneratedStep[];
};

export type LessonGenerationPromptInput = {
  subjectName: string;
  syllabus: string;
  classNumber: number;
  totalClasses: number;
  durationMinutes: number;
  topicTitle: string;
  chapters: GenerationLesson['chapters'];
  chunks: DidacticChunk[];
};

export function buildLessonGenerationMessages(input: LessonGenerationPromptInput): AIMessage[] {
  const chapters = input.chapters
    .map(({ chapter: c }) => {
      const pages = c.endPage ? `p. ${c.startPage} a ${c.endPage}` : `p. ${c.startPage}`;
      return `Cap. ${c.order}: ${c.title} — ${c.material.title} (${c.material.author}), ${pages}`;
    })
    .join('\n');
  const chunks = input.chunks.map((c) => `${formatCitation(c)}\n${c.content}`).join('\n\n');
  const content = [
    `Disciplina: ${input.subjectName}`,
    `Ementa: ${input.syllabus}`,
    `Aula ${input.classNumber} de ${input.totalClasses} · ${input.durationMinutes} minutos`,
    `Tema: ${input.topicTitle}`,
    `\nCapítulos da aula:\n${chapters}`,
    `\nTrechos de apoio:\n${chunks}`,
    '\nGere o conteúdo da aula.',
  ].join('\n');
  return [
    { role: 'system', content: LESSON_GENERATION_SYSTEM_PROMPT.trim() },
    { role: 'user', content },
  ];
}

const generationSchema = z.object({
  dailyObjective: z.string().trim().min(1),
  methodology: z.string().trim().min(1),
  resourcesNeeded: z.array(z.string().trim().min(1)),
  fixationExercise: z.string().trim().min(1),
  steps: z
    .array(
      z.object({
        activity: z.string().trim().min(1),
        description: z.string().trim().min(1),
        durationMinutes: z.number().int().min(1),
        socraticQuestion: z.string().trim().min(1).optional(),
      })
    )
    .min(1),
});

/** Extrai o primeiro objeto JSON do texto e valida; null quando ausente ou inválido. */
export function parseLessonGeneration(raw: string): GeneratedLessonText | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = generationSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const mm = (minutes: number) => String(minutes).padStart(2, '0');

/** timeSeconds é o início da etapa (checkpoint do vídeo); o intervalo vai do início ao fim acumulados. */
export function stepsToTimeScript(steps: GeneratedStep[]): TimeScriptItem[] {
  let start = 0;
  return steps.map((s) => {
    const item: TimeScriptItem = {
      timeSeconds: start * 60,
      timeRange: `${mm(start)}:00-${mm(start + s.durationMinutes)}:00`,
      activity: s.activity,
      description: s.description,
      ...(s.socraticQuestion ? { socraticQuestion: s.socraticQuestion } : {}),
    };
    start += s.durationMinutes;
    return item;
  });
}
