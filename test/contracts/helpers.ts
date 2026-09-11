/**
 * Pack a string exactly as the Anon Aadhaar circuit reveals it: little-endian char bytes, so
 * `convertRevealBigIntToString(packState('Delhi')) === 'Delhi'`.
 */
export function packState(state: string): bigint {
  let packed = 0n;
  for (let i = state.length - 1; i >= 0; i--) {
    packed = packed * 256n + BigInt(state.charCodeAt(i));
  }
  return packed;
}

/** A syntactically valid (all-zero) packed groth16 proof; the mock verifier ignores its contents. */
export const DUMMY_PROOF: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] = [
  0n,
  0n,
  0n,
  0n,
  0n,
  0n,
  0n,
  0n,
];
