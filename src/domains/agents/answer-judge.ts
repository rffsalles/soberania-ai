import type { AgendaType } from '@prisma/client';
import type { AIProviderType } from '@/lib/ai-provider';
import { JUDGE_MAX_TOKENS, JUDGE_SYSTEM_PROMPT } from '@/lib/constants/tutor';
import type { ChatDeps } from './services/chat-service';

/** Heurística: a tutora desafiou o aluno quando o turno termina em pergunta. */
export function isSocraticChallengeText(text: string): boolean {
  return text.trim().endsWith('?');
}

/** "INCORRETO" contém "CORRETO": a alternação testa INCORRETO primeiro; vence a primeira ocorrência. */
export function parseJudgeVerdict(raw: string): boolean | null {
  const match = /incorreto|correto/i.exec(raw);
  if (!match) return null;
  return match[0].toLowerCase() === 'correto';
}

export type JudgeInput = { challenge: string; answer: string; agendaType: AgendaType };
export type JudgeDeps = { streamChat: ChatDeps['streamChat']; provider: AIProviderType };

/** Julga a resposta do aluno. Nunca lança: qualquer falha vira `null` (sem veredito). */
export async function judgeAnswer(input: JudgeInput, deps: JudgeDeps): Promise<boolean | null> {
  if (deps.provider === 'mock') return null;
  try {
    let raw = '';
    const stream = deps.streamChat(
      [
        { role: 'system', content: JUDGE_SYSTEM_PROMPT },
        { role: 'user', content: `DESAFIO:\n${input.challenge}\n\nRESPOSTA DO ALUNO:\n${input.answer}` },
      ],
      { maxTokens: JUDGE_MAX_TOKENS, temperature: 0 }
    );
    for await (const chunk of stream) {
      if (chunk.token) raw += chunk.token;
    }
    return parseJudgeVerdict(raw);
  } catch (err) {
    console.warn('[judge] falha ao julgar a resposta do aluno', err);
    return null;
  }
}
