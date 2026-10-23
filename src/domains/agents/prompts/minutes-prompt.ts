import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';

export const MINUTES_SYSTEM_PROMPT = `
Você é a Tutora Lucy redigindo a Ata Pedagógica de um estudante ao final da aula, para o Professor Responsável.
Com base nas métricas fornecidas, responda APENAS com um objeto JSON no formato:
{"rawSummary": "resumo objetivo em 2 a 3 frases", "actionableAdvice": "uma recomendação prática de estudo"}
Não invente fatos além das métricas informadas.
`;

export type MinutesPromptInput = {
  sessionTitle: string;
  studentName: string;
  engagementScore: number;
  hesitationIndex: number;
  totalQuestionsAsked: number;
  socraticChallengesAnswered: number;
  topicsMastered: string[];
  topicsStruggled: string[];
};

export function buildMinutesMessages(input: MinutesPromptInput): AIMessage[] {
  return [
    { role: 'system', content: MINUTES_SYSTEM_PROMPT.trim() },
    { role: 'user', content: JSON.stringify(input) },
  ];
}

const minutesTextSchema = z.object({
  rawSummary: z.string().trim().min(1),
  actionableAdvice: z.string().trim().min(1),
});

export type MinutesText = z.infer<typeof minutesTextSchema>;

/** Extrai o primeiro objeto JSON do texto; null quando ausente ou inválido. */
export function parseMinutesText(raw: string): MinutesText | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = minutesTextSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
