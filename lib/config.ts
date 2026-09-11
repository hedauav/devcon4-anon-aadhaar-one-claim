import { CIRCOM_FIELD_P } from '@anon-aadhaar/core';

/** Server-side configuration. Every value here comes from the server environment, never the client. */
export type AppConfig = {
  /** Nullifier seed fixed by the office. Proofs carrying any other seed are rejected. */
  nullifierSeed: bigint;
  /** Applicants must reveal (inside the proof) residence in this state. */
  eligibleState: string;
  /** Accept proofs over the SDK test key instead of UIDAI's production key. */
  useTestAadhaar: boolean;
  /** Reject QR codes signed longer ago than this (0 = no limit). */
  qrMaxAgeSeconds: number;
};

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ConfigError(`Missing required environment variable ${key}`);
  return value;
}

export function parseNullifierSeed(raw: string): bigint {
  if (!/^[0-9]+$/.test(raw)) {
    throw new ConfigError('NULLIFIER_SEED must be a decimal integer');
  }
  const seed = BigInt(raw);
  if (seed <= 0n || seed >= CIRCOM_FIELD_P) {
    throw new ConfigError('NULLIFIER_SEED must be > 0 and below the BN254 field size');
  }
  return seed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const maxAge = Number(env.QR_MAX_AGE_SECONDS ?? '3600');
  return {
    nullifierSeed: parseNullifierSeed(required(env, 'NULLIFIER_SEED')),
    eligibleState: required(env, 'ELIGIBLE_STATE'),
    useTestAadhaar: env.USE_TEST_AADHAAR === 'true',
    qrMaxAgeSeconds: Number.isFinite(maxAge) && maxAge > 0 ? Math.floor(maxAge) : 0,
  };
}
