import { describe, it, expect } from 'vitest';
import { DEFAULT_SECRET, resolveJwtSecret, shouldUseSecureCookie, getSessionCookieConfig } from '../token';

describe('shouldUseSecureCookie', () => {
  it('is true in production', () => {
    expect(shouldUseSecureCookie({ NODE_ENV: 'production' })).toBe(true);
  });
  it('is true when FORCE_SECURE_COOKIE is "true"', () => {
    expect(shouldUseSecureCookie({ NODE_ENV: 'development', FORCE_SECURE_COOKIE: 'true' })).toBe(true);
  });
  it('is false otherwise', () => {
    expect(shouldUseSecureCookie({ NODE_ENV: 'development' })).toBe(false);
    expect(shouldUseSecureCookie({ NODE_ENV: 'development', FORCE_SECURE_COOKIE: 'false' })).toBe(false);
  });
  it('feeds the cookie config', () => {
    expect(getSessionCookieConfig(shouldUseSecureCookie({ FORCE_SECURE_COOKIE: 'true' })).options.secure).toBe(true);
  });
});

describe('resolveJwtSecret', () => {
  const strong = 'x'.repeat(32);

  it('em produção lança sem AUTH_SECRET', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(/AUTH_SECRET/);
  });

  it('em produção lança com segredo de menos de 32 caracteres', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', AUTH_SECRET: 'curto' })).toThrow(/32/);
  });

  it('em produção lança com o segredo padrão de desenvolvimento', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', AUTH_SECRET: DEFAULT_SECRET })).toThrow(/AUTH_SECRET/);
  });

  it('em produção aceita um segredo forte', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'production', AUTH_SECRET: strong })).toBe(strong);
  });

  it('fora de produção usa o fallback de desenvolvimento', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBe(DEFAULT_SECRET);
    expect(resolveJwtSecret({ NODE_ENV: 'test', AUTH_SECRET: 'curto' })).toBe('curto');
  });
});
