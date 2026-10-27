import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';
import type { PlanChapterBook } from '@/domains/teaching/services/plan-chapters-service';

export const PLAN_UNITS_MIN = 3;
export const PLAN_UNITS_MAX = 6;

export const buildPlanUnitsSystemPrompt = (minUnits: number) => `
Você é a Tutora Lucy auxiliando o Professor Responsável a organizar o plano de ensino em unidades, a partir da distribuição dos capítulos pelas aulas.
Regras:
- Crie de ${minUnits} a ${PLAN_UNITS_MAX} unidades, com "unitNumber" sequencial a partir de 1.
- Use somente os ids de capítulo fornecidos; não invente capítulos.
- Inclua em chapterIds todos os capítulos de cada aula; nenhum capítulo distribuído pode ficar fora das unidades.
- Cada aula deve ficar inteira em uma única unidade: todos os capítulos de uma aula pertencem à mesma unidade, e uma aula nunca é dividida entre unidades.
- Cada unidade tem um "title" curto e uma lista de "topics" (tópicos curtos, não vazios).
- Mantenha a ordem das aulas: as unidades seguem a sequência do cronograma.
Responda APENAS com um objeto JSON no formato:
{"units":[{"unitNumber":1,"title":"Título da unidade","topics":["Tópico"],"chapterIds":["id"]}]}
`;

export const PLAN_UNITS_SYSTEM_PROMPT = buildPlanUnitsSystemPrompt(PLAN_UNITS_MIN);

export type PlanUnitItem = { unitNumber: number; title: string; topics: string[]; chapterIds: string[] };

export type PlanUnitsPromptInput = {
  subjectName: string;
  syllabus: string;
  objectives: string;
  lessons: { classNumber: number; topicTitle: string; chapterIds: string[] }[];
  books: PlanChapterBook[];
  minUnits?: number;
};

export function buildPlanUnitsMessages(input: PlanUnitsPromptInput): AIMessage[] {
  const lessons = input.lessons
    .map((l) => `Aula ${l.classNumber} · ${l.topicTitle} · capítulos: ${l.chapterIds.join(', ')}`)
    .join('\n');
  const books = input.books
    .map((b) => {
      const chapters = b.chapters
        .map((c) => {
          const pages = c.endPage ? `p. ${c.startPage} a ${c.endPage}` : `p. ${c.startPage}`;
          return `id=${c.id} · Cap. ${c.number}: ${c.title} (${pages})`;
        })
        .join('\n');
      return `${b.title} (${b.author})\n${chapters}`;
    })
    .join('\n\n');
  const content = [
    `Disciplina: ${input.subjectName}`,
    `Ementa: ${input.syllabus}`,
    `Objetivos: ${input.objectives}`,
    `\nAulas e capítulos distribuídos:\n${lessons}`,
    `\nLivros e capítulos:\n${books}`,
    '\nOrganize o plano em unidades.',
  ].join('\n');
  return [
    { role: 'system', content: buildPlanUnitsSystemPrompt(input.minUnits ?? PLAN_UNITS_MIN).trim() },
    { role: 'user', content },
  ];
}

const UNIT_TITLE_MAX_LENGTH = 200;

const unitsSchema = z.object({
  units: z.array(
    z.object({
      unitNumber: z.number().int(),
      title: z.string().trim().min(1).transform((t) => t.slice(0, UNIT_TITLE_MAX_LENGTH).trim()),
      topics: z.array(z.string()).transform((ts) => ts.map((t) => t.trim()).filter((t) => t.length > 0)),
      chapterIds: z.array(z.string()).transform((ids) => [...new Set(ids)]),
    })
  ),
});

/** Extrai o primeiro objeto JSON do texto e valida; null quando ausente ou inválido. */
export function parsePlanUnits(raw: string): PlanUnitItem[] | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = unitsSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data.units : null;
  } catch {
    return null;
  }
}

/** Grupos de aulas ligadas por capítulo em comum (componentes conexos); aulas sem capítulos são ignoradas. */
export function countLessonGroups(lessons: { chapterIds: string[] }[]): number {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const l of lessons) {
    for (const id of l.chapterIds) if (!parent.has(id)) parent.set(id, id);
    for (let i = 1; i < l.chapterIds.length; i++) {
      parent.set(find(l.chapterIds[i]), find(l.chapterIds[0]));
    }
  }
  const roots = new Set<string>();
  for (const l of lessons) if (l.chapterIds.length > 0) roots.add(find(l.chapterIds[0]));
  return roots.size;
}

/** Entre minUnits e 6 unidades numeradas em sequência, com tópicos, só capítulos do plano e cada aula inteira numa única unidade. */
export function isValidPlanUnits(
  units: PlanUnitItem[],
  lessons: { classNumber: number; chapterIds: string[] }[],
  planChapterIds: Set<string>,
  minUnits: number = PLAN_UNITS_MIN
): boolean {
  if (units.length < minUnits || units.length > PLAN_UNITS_MAX) return false;
  if (!units.every((u, i) => u.unitNumber === i + 1)) return false;
  if (!units.every((u) => u.topics.length > 0)) return false;
  if (!units.every((u) => u.chapterIds.every((id) => planChapterIds.has(id)))) return false;
  return lessons.every((l) => {
    if (l.chapterIds.length === 0) return true;
    const holders = units.filter((u) => l.chapterIds.some((id) => u.chapterIds.includes(id)));
    return holders.length === 1 && l.chapterIds.every((id) => holders[0].chapterIds.includes(id));
  });
}
