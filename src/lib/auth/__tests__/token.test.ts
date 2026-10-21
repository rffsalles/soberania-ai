import { describe, it, expect } from 'vitest';
import { shouldUseSecureCookie, getSessionCookieConfig } from '../token';

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
