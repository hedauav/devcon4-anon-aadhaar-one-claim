/**
 * Tiny in-memory fixed-window rate limiter (per server process, never persisted).
 *
 * Abuse throttling only. It is NEVER used to decide whether someone has already applied:
 * one-application-per-person is decided solely by the proof's nullifier (lib/intake.ts).
 */
type Bucket = { count: number; resetAt: number };

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

export function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();

  function sweep(now: number) {
    if (buckets.size < 5_000) return;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }

  return function hit(key: string, now = Date.now()): RateLimitResult {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      sweep(now);
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    return { ok: true, retryAfterSeconds: 0 };
  };
}

/** Best-effort client key for throttling (first X-Forwarded-For hop behind a proxy). */
export function throttleKey(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local'
  );
}

/** 20 application drafts per 10 minutes per client. */
export const draftLimiter = createRateLimiter(20, 10 * 60 * 1000);
/** 10 volunteer login attempts per 15 minutes per client. */
export const loginLimiter = createRateLimiter(10, 15 * 60 * 1000);
