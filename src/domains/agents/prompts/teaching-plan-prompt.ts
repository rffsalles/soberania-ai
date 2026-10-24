import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';
import type { DidacticChunk } from '@/domains/rag/types';
import { formatCitation } from '@/domains/rag/hybrid-search';

export const TEACHING_PLAN_SYSTEM_PROMPT = `
Você é a Tutora Lucy auxiliando o Professor Responsável a redigir o Plano de Ensino de uma disciplina de graduação.
Fundamente a proposta nas referências bibliográficas e nos trechos do acervo fornecidos; não invente obras, autores ou páginas.
Responda APENAS com um objeto JSON em português no formato:
{"syllabus":"ementa em 4 a 6 frases","generalObjectives":"objetivo geral em 1 a 2 frases","bloomLevels":["Nível N: verbo + objeto (3 a 4 itens, Taxonomia de Bloom)"],"methodology":"metodologia socrática e estratégias ativas em 2 a 3 frases"}
`;

export type TeachingPlanReference = { title: string; author: string };

export type TeachingPlanPromptInput = {
  subjectName: string;
  courseName?: string;
  academicPeriod?: string;
  workloadHours?: number;
  references: TeachingPlanReference[];
  chunks: DidacticChunk[];
};

export function buildTeachingPlanMessages(input: TeachingPlanPromptInput): AIMessage[] {
  const lines = [`Disciplina: ${input.subjectName}`];
  if (input.courseName) lines.push(`Curso: ${input.courseName}`);
  if (input.academicPeriod) lines.push(`Período letivo: ${input.academicPeriod}`);
  if (input.workloadHours) lines.push(`Carga horária: ${input.workloadHours}h`);
  const references = input.references.map((r) => `- ${r.title} (${r.author})`).join('\n');
  lines.push(`\nReferências selecionadas pelo professor:\n${references || '- (nenhuma)'}`);
  const context = input.chunks.map((c) => `${formatCitation(c)} ${c.content}`).join('\n');
  lines.push(`\nTrechos recuperados do acervo:\n${context || '(nenhum trecho indexado para estas referências)'}`);
  lines.push('\nElabore a ementa, o objetivo geral, os níveis de Bloom e a metodologia.');
  return [
    { role: 'system', content: TEACHING_PLAN_SYSTEM_PROMPT.trim() },
    { role: 'user', content: lines.join('\n') },
  ];
}

const teachingPlanTextSchema = z.object({
  syllabus: z.string().trim().min(1),
  generalObjectives: z.string().trim().min(1),
  bloomLevels: z.array(z.string().trim().min(1)).min(1),
  methodology: z.string().trim().min(1),
});

export type TeachingPlanText = z.infer<typeof teachingPlanTextSchema>;

/** Extrai o primeiro objeto JSON do texto e valida; null quando ausente ou inválido. */
export function parseTeachingPlanText(raw: string): TeachingPlanText | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = teachingPlanTextSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
