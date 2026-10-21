import { z } from 'zod';

/** Limites do payload do chat: protegem o banco, o provider, o embedding e a busca textual. */
export const CHAT_MESSAGE_MAX_CHARS = 4000;
export const CHAT_HISTORY_MAX_TURNS = 20;

export const chatRequestSchema = z.object({
  agendaId: z.string().min(1, 'Parâmetro agendaId é obrigatório.'),
  message: z
    .string()
    .min(1, 'Parâmetro message é obrigatório.')
    .max(CHAT_MESSAGE_MAX_CHARS, `A mensagem deve ter no máximo ${CHAT_MESSAGE_MAX_CHARS} caracteres.`),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z
          .string()
          .max(CHAT_MESSAGE_MAX_CHARS, `Cada mensagem do histórico deve ter no máximo ${CHAT_MESSAGE_MAX_CHARS} caracteres.`),
      })
    )
    .max(CHAT_HISTORY_MAX_TURNS, `O histórico deve ter no máximo ${CHAT_HISTORY_MAX_TURNS} mensagens.`)
    .optional(),
  videoTimestampSeconds: z.number().optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
