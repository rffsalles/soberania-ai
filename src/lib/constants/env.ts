export const ENV = {
  AI_PROVIDER: 'AI_PROVIDER',
  AI_BASE_URL: 'AI_BASE_URL',
  AI_API_KEY: 'AI_API_KEY',
  AI_EMBEDDING_MODEL: 'AI_EMBEDDING_MODEL',
  ENABLE_PYTHON_SANDBOX: 'ENABLE_PYTHON_SANDBOX',
  FORCE_SECURE_COOKIE: 'FORCE_SECURE_COOKIE',
  /** Atalhos de login de demonstração; lida por acesso literal (process.env.NEXT_PUBLIC_DEMO_MODE) no cliente. */
  NEXT_PUBLIC_DEMO_MODE: 'NEXT_PUBLIC_DEMO_MODE',
  /** Fuso IANA da instituição (padrão America/Sao_Paulo); lida por acesso literal em lib/constants/teaching. */
  NEXT_PUBLIC_INSTITUTION_TIMEZONE: 'NEXT_PUBLIC_INSTITUTION_TIMEZONE',
} as const;
