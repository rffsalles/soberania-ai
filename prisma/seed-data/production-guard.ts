/**
 * Recusa rodar o seed em produção sem confirmação explícita: ele cria contas de
 * demonstração com senhas públicas (veja src/lib/constants/demo-credentials.ts).
 */
export function assertSeedAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV === 'production' && env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
    throw new Error(
      'Seed bloqueado em produção: ele cria contas de demonstração com senhas públicas ' +
        '(documentadas no repositório). Se for realmente um ambiente descartável, defina ' +
        'ALLOW_SEED_IN_PRODUCTION=true. Nunca faça isso em produção real.',
    );
  }
}
