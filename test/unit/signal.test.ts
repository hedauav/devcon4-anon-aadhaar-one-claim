import { CIRCOM_FIELD_P, hash } from '@anon-aadhaar/core';
import { describe, expect, it } from 'vitest';
import { deriveSignal, signalHashOf } from '@/lib/signal';

describe('deriveSignal', () => {
  it('is deterministic for a (cycle, draft) pair', () => {
    expect(deriveSignal('cycle-1', 'draft-1')).toBe(deriveSignal('cycle-1', 'draft-1'));
  });

  it('is a decimal string below 2^248 (valid SDK hash input and uint256)', () => {
    const signal = deriveSignal('cycle-1', 'draft-1');
    expect(signal).toMatch(/^[0-9]+$/);
    expect(BigInt(signal)).toBeLessThan(2n ** 248n);
  });

  it('differs per draft and per cycle', () => {
    const base = deriveSignal('cycle-1', 'draft-1');
    expect(deriveSignal('cycle-1', 'draft-2')).not.toBe(base);
    expect(deriveSignal('cycle-2', 'draft-1')).not.toBe(base);
  });
});

describe('signalHashOf', () => {
  it('matches the SDK hash() used by the prover', () => {
    const signal = deriveSignal('cycle-1', 'draft-1');
    expect(signalHashOf(signal)).toBe(hash(signal));
    expect(BigInt(signalHashOf(signal))).toBeLessThan(CIRCOM_FIELD_P);
  });
});
