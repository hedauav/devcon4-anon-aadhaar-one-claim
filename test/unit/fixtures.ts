import { randomBytes } from 'node:crypto';
import { testPublicKeyHash } from '@anon-aadhaar/core';
import { vi } from 'vitest';
import type { AppConfig } from '@/lib/config';
import { openDatabase } from '@/lib/db';
import { createIntake, type ProofVerifier } from '@/lib/intake';
import { signalHashOf } from '@/lib/signal';
import { openCycle, type Draft } from '@/lib/store';

/** Small, obviously-fake seed used only by tests. */
export const TEST_CONFIG: AppConfig = {
  nullifierSeed: 123456789n,
  eligibleState: 'Delhi',
  useTestAadhaar: true,
  qrMaxAgeSeconds: 3600,
};

export const FORM = { householdSize: 4, supportCategory: 'food' as const };

/** Pack a string the way the circuit reveals it: first char in the least-significant byte. */
export function packState(state: string): string {
  let value = 0n;
  for (let i = 0; i < state.length; i++) {
    value += BigInt(state.charCodeAt(i)) << BigInt(8 * i);
  }
  return value.toString();
}

/** Random app-scoped nullifier, generated at runtime. */
export function randomNullifier(): string {
  return BigInt(`0x${randomBytes(31).toString('hex')}`).toString();
}

export type ProofOverrides = Partial<{
  nullifierSeed: string;
  nullifier: string;
  signalHash: string;
  timestamp: string;
  ageAbove18: string;
  gender: string;
  pincode: string;
  state: string;
}> & { claim?: Record<string, unknown> };

/**
 * Build a proof string shaped exactly like `SerializedPCD.pcd` from @anon-aadhaar/react.
 * The groth16 points are dummies: tests inject the verifier, so only public signals matter.
 */
export function makeSerializedProof(
  draft: Draft,
  overrides: ProofOverrides = {},
  nowMs = Date.now(),
): string {
  const { claim, ...proofOverrides } = overrides;
  const proof = {
    groth16Proof: {
      pi_a: ['1', '2', '1'],
      pi_b: [
        ['3', '4'],
        ['5', '6'],
        ['1', '0'],
      ],
      pi_c: ['7', '8', '1'],
      protocol: 'groth16',
      curve: 'bn128',
    },
    pubkeyHash: testPublicKeyHash,
    timestamp: String(Math.floor(nowMs / 1000) - 60),
    nullifierSeed: TEST_CONFIG.nullifierSeed.toString(),
    nullifier: randomNullifier(),
    signalHash: signalHashOf(draft.signal),
    ageAbove18: '1',
    gender: '0',
    pincode: '0',
    state: packState('Delhi'),
    ...proofOverrides,
  };
  return JSON.stringify({
    type: 'anon-aadhaar',
    id: 'client-generated-id',
    claim: claim ?? {
      pubKey: [],
      signalHash: proof.signalHash,
      ageAbove18: true,
      gender: null,
      pincode: null,
      state: 'Delhi',
    },
    proof,
  });
}

export function setup(
  opts: { verifier?: ProofVerifier; now?: () => number; config?: Partial<AppConfig> } = {},
) {
  const db = openDatabase(':memory:');
  const verifyProof = vi.fn<ProofVerifier>(opts.verifier ?? (async () => true));
  const config = { ...TEST_CONFIG, ...opts.config };
  const intake = createIntake({ db, config, verifyProof, now: opts.now });
  const cycle = openCycle(db, 'Test cycle', opts.now?.());
  return { db, verifyProof, intake, cycle, config };
}

export function count(db: ReturnType<typeof openDatabase>, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}
