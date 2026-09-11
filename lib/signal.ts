import { createHash } from 'node:crypto';
import { hash } from '@anon-aadhaar/core';

/**
 * Derive the proof signal for one application draft.
 *
 * The signal is computed by the SERVER from (cycleId, draftId) and handed to the applicant's
 * browser, which commits to it inside the proof. It is a 248-bit decimal string so that it is a
 * valid input to the SDK's `hash()` (which only accepts numeric values) and fits in a uint256.
 */
export function deriveSignal(cycleId: string, draftId: string): string {
  const digest = createHash('sha256').update(`one-claim/v1:${cycleId}:${draftId}`).digest('hex');
  return BigInt(`0x${digest.slice(0, 62)}`).toString();
}

/** The value the circuit exposes as `signalHash`, computed with the SDK's own hash function. */
export function signalHashOf(signal: string): string {
  return hash(signal);
}
