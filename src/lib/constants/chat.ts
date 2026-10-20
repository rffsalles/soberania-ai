/** Nomes dos eventos SSE do stream do tutor, compartilhados entre rota e cliente. */
export const SSE_EVENT = { TOKEN: 'token', DONE: 'done', ERROR: 'error' } as const;

/** Quantidade máxima de mensagens anteriores enviadas como contexto ao tutor. */
export const CHAT_HISTORY_LIMIT = 10;
