import { describe, expect, it } from 'vitest';
import { createRateLimiter, throttleKey } from '@/lib/rate-limit';

describe('rate limiter', () => {
  it('allows up to the limit per window, then refuses until the window resets', () => {
    const hit = createRateLimiter(2, 1000);
    const t = 1_000_000;
    expect(hit('a', t).ok).toBe(true);
    expect(hit('a', t + 10).ok).toBe(true);
    const third = hit('a', t + 20);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBe(1);
    expect(hit('b', t + 20).ok).toBe(true); // other clients unaffected
    expect(hit('a', t + 1000).ok).toBe(true); // new window
  });

  it('derives a throttle key from proxy headers', () => {
    expect(throttleKey(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
    expect(throttleKey(new Headers())).toBe('local');
  });
});
