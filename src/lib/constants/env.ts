export const ENV = {
  AI_PROVIDER: 'AI_PROVIDER',
  AI_BASE_URL: 'AI_BASE_URL',
  AI_API_KEY: 'AI_API_KEY',
  /** Vazio/ausente desliga embeddings (busca só léxica). */
  AI_EMBEDDING_MODEL: 'AI_EMBEDDING_MODEL',
  /** Endpoint próprio de embeddings (padrão: AI_BASE_URL). */
  AI_EMBEDDING_BASE_URL: 'AI_EMBEDDING_BASE_URL',
  /** Chave do endpoint de embeddings (padrão: AI_API_KEY). */
  AI_EMBEDDING_API_KEY: 'AI_EMBEDDING_API_KEY',
  ENABLE_PYTHON_SANDBOX: 'ENABLE_PYTHON_SANDBOX',
  FORCE_SECURE_COOKIE: 'FORCE_SECURE_COOKIE',
  /** Atalhos de login de demonstração; lida por acesso literal (process.env.NEXT_PUBLIC_DEMO_MODE) no cliente. */
  NEXT_PUBLIC_DEMO_MODE: 'NEXT_PUBLIC_DEMO_MODE',
  /** Fuso IANA da instituição (padrão America/Sao_Paulo); lida por acesso literal em lib/constants/teaching. */
  NEXT_PUBLIC_INSTITUTION_TIMEZONE: 'NEXT_PUBLIC_INSTITUTION_TIMEZONE',
  /** SOMENTE PARA TESTES LOCAIS: 'true' ignora a janela de horário das sessões. Nunca ative em produção. Lida em lib/constants/teaching. */
  NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW: 'NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW',
} as const;
