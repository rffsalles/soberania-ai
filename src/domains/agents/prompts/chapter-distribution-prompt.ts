import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';
import type { PlanChapterBook } from '@/domains/teaching/services/plan-chapters-service';

export const CHAPTER_DISTRIBUTION_SYSTEM_PROMPT = `
Você é a Tutora Lucy auxiliando o Professor Responsável a distribuir os capítulos dos livros do plano de ensino pelas aulas do cronograma.
Regras:
- Cubra todos os capítulos listados, respeitando a ordem dos capítulos em cada livro.
- Um capítulo pode se repetir em aulas consecutivas quando for extenso; nunca deixe uma aula sem capítulos.
- Use somente os ids de capítulo fornecidos; não invente capítulos.
- Para cada aula, dê um "topicTitle" curto (até 8 palavras) coerente com os capítulos.
- Inclua TODAS as aulas, cada uma exatamente uma vez.
Responda APENAS com um objeto JSON no formato:
{"lessons":[{"classNumber":1,"topicTitle":"Título curto","chapterIds":["id"]}]}
`;

export type DistributionItem = { classNumber: number; topicTitle: string; chapterIds: string[] };

export type ChapterDistributionPromptInput = {
  subjectName: string;
  syllabus: string;
  objectives: string;
  lessons: { classNumber: number; date: string; durationMinutes: number }[];
  books: PlanChapterBook[];
};

export function buildChapterDistributionMessages(input: ChapterDistributionPromptInput): AIMessage[] {
  const lessons = input.lessons.map((l) => `Aula ${l.classNumber} · ${l.date} · ${l.durationMinutes} min`).join('\n');
  const books = input.books
    .map((b) => {
      const chapters = b.chapters
        .map((c) => {
          const pages = c.endPage ? `p. ${c.startPage} a ${c.endPage}` : `p. ${c.startPage}`;
          return `id=${c.id} · Cap. ${c.order}: ${c.title} (${pages})`;
        })
        .join('\n');
      return `${b.title} (${b.author})\n${chapters}`;
    })
    .join('\n\n');
  const content = [
    `Disciplina: ${input.subjectName}`,
    `Ementa: ${input.syllabus}`,
    `Objetivos: ${input.objectives}`,
    `\nAulas do cronograma:\n${lessons}`,
    `\nLivros e capítulos:\n${books}`,
    '\nDistribua os capítulos pelas aulas.',
  ].join('\n');
  return [
    { role: 'system', content: CHAPTER_DISTRIBUTION_SYSTEM_PROMPT.trim() },
    { role: 'user', content },
  ];
}

const TOPIC_TITLE_MAX_LENGTH = 120;

const distributionSchema = z.object({
  lessons: z.array(
    z.object({
      classNumber: z.number().int(),
      topicTitle: z.string().trim().min(1).transform((t) => t.slice(0, TOPIC_TITLE_MAX_LENGTH).trim()),
      chapterIds: z.array(z.string()),
    })
  ),
});

/** Extrai o primeiro objeto JSON do texto e valida; null quando ausente ou inválido. */
export function parseChapterDistribution(raw: string): DistributionItem[] | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = distributionSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data.lessons : null;
  } catch {
    return null;
  }
}

/** Cada aula do cronograma exatamente uma vez, sem extras, só capítulos do plano e nunca vazio. */
export function isValidDistribution(items: DistributionItem[], classNumbers: number[], chapterIds: Set<string>): boolean {
  if (items.length !== classNumbers.length) return false;
  const seen = new Set(items.map((i) => i.classNumber));
  if (seen.size !== items.length) return false;
  if (!classNumbers.every((n) => seen.has(n))) return false;
  return items.every((i) => i.chapterIds.length > 0 && i.chapterIds.every((id) => chapterIds.has(id)));
}
