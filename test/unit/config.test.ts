import { CIRCOM_FIELD_P } from '@anon-aadhaar/core';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseNullifierSeed } from '@/lib/config';

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe('parseNullifierSeed', () => {
  it('accepts a decimal integer inside the field', () => {
    expect(parseNullifierSeed('12345')).toBe(12345n);
    expect(parseNullifierSeed((CIRCOM_FIELD_P - 1n).toString())).toBe(CIRCOM_FIELD_P - 1n);
  });

  it.each([
    ['non-decimal', 'abc'],
    ['hex', '0x1f'],
    ['negative', '-1'],
    ['zero', '0'],
    ['field size', CIRCOM_FIELD_P.toString()],
    ['above field size', (CIRCOM_FIELD_P + 1n).toString()],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseNullifierSeed(raw)).toThrow(ConfigError);
  });
});

describe('loadConfig', () => {
  it('reads every value from the server environment', () => {
    expect(
      loadConfig(
        env({
          NULLIFIER_SEED: '42',
          ELIGIBLE_STATE: 'Delhi',
          USE_TEST_AADHAAR: 'true',
          QR_MAX_AGE_SECONDS: '600',
        }),
      ),
    ).toEqual({
      nullifierSeed: 42n,
      eligibleState: 'Delhi',
      useTestAadhaar: true,
      qrMaxAgeSeconds: 600,
    });
  });

  it('defaults to production mode and a 1 hour QR age, and allows disabling the age check', () => {
    const base = { NULLIFIER_SEED: '42', ELIGIBLE_STATE: 'Delhi' };
    expect(loadConfig(env(base))).toMatchObject({ useTestAadhaar: false, qrMaxAgeSeconds: 3600 });
    expect(loadConfig(env({ ...base, QR_MAX_AGE_SECONDS: '0' })).qrMaxAgeSeconds).toBe(0);
  });

  it('fails fast when required values are missing', () => {
    expect(() => loadConfig(env({ ELIGIBLE_STATE: 'Delhi' }))).toThrow(ConfigError);
    expect(() => loadConfig(env({ NULLIFIER_SEED: '42' }))).toThrow(ConfigError);
  });
});
