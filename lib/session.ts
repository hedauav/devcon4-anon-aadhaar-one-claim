import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Volunteer session: an HMAC-signed expiry in an httpOnly cookie. No user table, no identity. */
export const SESSION_COOKIE = 'oc_volunteer';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time password check against the server-side VOLUNTEER_PASSWORD. */
export function passwordMatches(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return timingSafeEqual(digest(input), digest(expected));
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(secret: string, nowMs = Date.now()): string {
  const expires = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  return `${expires}.${sign(String(expires), secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!token || !secret) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || !/^[0-9]+$/.test(expires)) return false;
  const expected = sign(expires, secret);
  if (expected.length !== signature.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  return Number(expires) > Math.floor(nowMs / 1000);
}

/** SESSION_SECRET from the server environment; refuses missing, short or placeholder secrets. */
export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-with-')) return undefined;
  return secret;
}
