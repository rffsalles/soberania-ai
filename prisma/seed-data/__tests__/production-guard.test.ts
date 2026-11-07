import { describe, expect, it } from 'vitest';
import { assertSeedAllowed } from '../production-guard';

describe('assertSeedAllowed', () => {
  it('bloqueia em produção sem a flag', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/senhas públicas/);
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', ALLOW_SEED_IN_PRODUCTION: 'false' })).toThrow();
  });
  it('permite em produção com a flag explícita', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', ALLOW_SEED_IN_PRODUCTION: 'true' })).not.toThrow();
  });
  it('permite fora de produção', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
  });
});
