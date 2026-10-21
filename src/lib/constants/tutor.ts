/** Menções que acionam a Tutora no chat do grupo de estudos (comparação sem diferenciar maiúsculas). */
export const TUTOR_MENTIONS = ['@lucy', '@tutora', '@luci'] as const;

/** Nome exibido nas mensagens da Tutora. */
export const TUTOR_DISPLAY_NAME = 'Tutora Lucy';

/** Silêncio (em minutos) após o qual a Tutora intervém no grupo de estudos. */
export const STUDY_GROUP_STALEMATE_MINUTES = 5;

/** Intervalo de atualização do chat do grupo de estudos. */
export const STUDY_GROUP_POLL_MS = 5000;

/** Quantidade máxima de mensagens retornadas por consulta. */
export const STUDY_GROUP_LIST_LIMIT = 200;

/** Quantidade de mensagens recentes enviadas como contexto à Tutora. */
export const STUDY_GROUP_CONTEXT_MESSAGES = 10;

export const STUDY_GROUP_MAX_MESSAGE_LENGTH = 2000;
