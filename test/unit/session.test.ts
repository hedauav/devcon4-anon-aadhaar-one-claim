import { describe, expect, it } from 'vitest';
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  getSessionSecret,
  passwordMatches,
  verifySessionToken,
} from '@/lib/session';

// Obviously-fake values built at runtime; nothing here is a real credential.
const SECRET = 'test-secret-' + 'x'.repeat(32);
const OTHER_SECRET = 'test-secret-' + 'y'.repeat(32);

describe('volunteer session token', () => {
  it('round-trips with the same secret', () => {
    const now = Date.now();
    const token = createSessionToken(SECRET, now);
    expect(verifySessionToken(token, SECRET, now)).toBe(true);
  });

  it('rejects a tampered token', () => {
    const now = Date.now();
    const token = createSessionToken(SECRET, now);
    const [expires, signature] = token.split('.');
    const flipped = signature[0] === 'A' ? 'B' : 'A';
    expect(verifySessionToken(`${expires}.${flipped}${signature.slice(1)}`, SECRET, now)).toBe(
      false,
    );
    expect(verifySessionToken(`${Number(expires) + 3600}.${signature}`, SECRET, now)).toBe(false);
  });

  it('rejects an expired token', () => {
    const now = Date.now();
    const token = createSessionToken(SECRET, now);
    expect(verifySessionToken(token, SECRET, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBe(false);
  });

  it('rejects a token signed with a different secret, or missing inputs', () => {
    const token = createSessionToken(SECRET);
    expect(verifySessionToken(token, OTHER_SECRET)).toBe(false);
    expect(verifySessionToken(undefined, SECRET)).toBe(false);
    expect(verifySessionToken(token, undefined)).toBe(false);
    expect(verifySessionToken('garbage', SECRET)).toBe(false);
  });
});

describe('passwordMatches', () => {
  const expected = 'fake-volunteer-' + 'z'.repeat(8);

  it('accepts the exact password only', () => {
    expect(passwordMatches(expected, expected)).toBe(true);
    expect(passwordMatches(expected + '!', expected)).toBe(false);
    expect(passwordMatches('', expected)).toBe(false);
  });

  it('fails closed when no password is configured', () => {
    expect(passwordMatches('anything', undefined)).toBe(false);
    expect(passwordMatches('', '')).toBe(false);
  });
});

describe('getSessionSecret', () => {
  it('refuses missing or short secrets', () => {
    const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;
    expect(getSessionSecret(env({}))).toBeUndefined();
    expect(getSessionSecret(env({ SESSION_SECRET: 'short' }))).toBeUndefined();
    expect(getSessionSecret(env({ SESSION_SECRET: SECRET }))).toBe(SECRET);
  });
});
