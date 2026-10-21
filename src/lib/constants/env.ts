export const ENV = {
  AI_PROVIDER: 'AI_PROVIDER',
  AI_BASE_URL: 'AI_BASE_URL',
  AI_API_KEY: 'AI_API_KEY',
  AI_EMBEDDING_MODEL: 'AI_EMBEDDING_MODEL',
  ENABLE_PYTHON_SANDBOX: 'ENABLE_PYTHON_SANDBOX',
  FORCE_SECURE_COOKIE: 'FORCE_SECURE_COOKIE',
  NEXT_PUBLIC_DEMO_MODE: 'NEXT_PUBLIC_DEMO_MODE',
} as const;

/**
 * Modo demonstração (atalhos de login com as credenciais do seed).
 * Lido por acesso literal para o Next.js embutir o valor no bundle do cliente.
 */
export function isDemoMode(value: string | undefined = process.env.NEXT_PUBLIC_DEMO_MODE): boolean {
  return value === 'true';
}
