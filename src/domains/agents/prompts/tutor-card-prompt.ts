import type { AIMessage } from '@/lib/ai-provider';
import type { DidacticChunk } from '@/domains/rag/types';
import { isSyntheticChapter } from '@/domains/rag/constants';
import { stripUnsupportedReferences } from '@/domains/agents/citation-guard';
import { toPlainText } from '@/domains/agents/plain-text';
import type { TutorCardPayload } from '@/domains/classroom/class-event-schema';

export type CardSource = DidacticChunk & { label: string };

const MAX_CONCEPTS = 3;
const MIN_CONCEPTS = 2;

export const TUTOR_CARD_SYSTEM_PROMPT = `
Você é a Tutora Lucy preparando um cartão de apoio para os alunos durante a aula.
Use SOMENTE os trechos fornecidos. Responda APENAS com um objeto JSON, sem markdown, no formato:
{"concepts":[{"title":"...","explanation":"...","chunkId":"..."}],"objectiveLink":"..."}
Escolha 2 ou 3 conceitos do passo da aula. Cada conceito é explicado somente com o trecho cujo "id" você informa em "chunkId".
A "explanation" tem até 400 caracteres, em texto corrido, sem markdown e sem citar páginas ou capítulos.
O "objectiveLink" é uma frase ligando o passo ao objetivo do dia, sem markdown e sem citar páginas.
`;

export function chunkLabel(chunk: DidacticChunk, chapterLabels: Map<string, string>): string {
  const fromChapter = chunk.chapterId ? chapterLabels.get(chunk.chapterId) : undefined;
  return (fromChapter ?? `${chunk.chapter} — ${chunk.bookTitle}`).slice(0, 200);
}

export function buildTutorCardMessages(input: {
  activity: string;
  description: string;
  dailyObjective: string;
  sources: CardSource[];
}): AIMessage[] {
  const context = input.sources.map((s) => `id: ${s.id}\n${s.label}\n${s.content}`).join('\n\n');
  const user = `Passo da aula: ${input.activity}\nDescrição: ${input.description}\nObjetivo do dia: ${input.dailyObjective}\n\nTrechos de apoio:\n${context}\n\nMonte o cartão.`;
  return [
    { role: 'system', content: TUTOR_CARD_SYSTEM_PROMPT.trim() },
    { role: 'user', content: user },
  ];
}

/** Primeiro objeto JSON balanceado do texto (ignora prosa ao redor). */
function extractJsonObject(raw: string): unknown {
  for (let start = raw.indexOf('{'); start !== -1; start = raw.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseTutorCard(
  raw: string,
  sources: CardSource[],
): Omit<TutorCardPayload, 'source'> | null {
  const parsed = extractJsonObject(raw);
  if (!isRecord(parsed) || !Array.isArray(parsed.concepts)) return null;
  const byId = new Map(sources.map((s) => [s.id, s]));

  const concepts: Omit<TutorCardPayload, 'source'>['concepts'] = [];
  for (const item of parsed.concepts) {
    if (concepts.length >= MAX_CONCEPTS) break;
    if (!isRecord(item)) continue;
    const { title, explanation, chunkId } = item;
    if (typeof title !== 'string' || typeof explanation !== 'string' || typeof chunkId !== 'string') continue;
    const source = byId.get(chunkId);
    if (!source) continue;
    const cleanExplanation = toPlainText(stripUnsupportedReferences(explanation, sources).text)
      .trim()
      .slice(0, 400);
    const cleanTitle = toPlainText(title).trim().slice(0, 80);
    if (!cleanExplanation || !cleanTitle) continue;
    concepts.push({
      title: cleanTitle,
      explanation: cleanExplanation,
      citation: {
        chunkId,
        label: source.label,
        page: isSyntheticChapter(source.chapter) || source.pageNumber < 1 ? null : source.pageNumber,
      },
    });
  }
  if (concepts.length < MIN_CONCEPTS) return null;

  const objectiveLink =
    typeof parsed.objectiveLink === 'string' ? toPlainText(parsed.objectiveLink).trim().slice(0, 300) : '';
  if (!objectiveLink) return null;
  return { concepts, objectiveLink };
}
