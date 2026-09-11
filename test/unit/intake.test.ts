import { convertRevealBigIntToString } from '@anon-aadhaar/core';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_TTL_MS,
  closeCycle,
  createDraft,
  getDraft,
  getStats,
  listApplications,
  openCycle,
} from '@/lib/store';
import { QR_TIMESTAMP_ROUNDING_SECONDS } from '@/lib/intake';
import { FORM, count, makeSerializedProof, packState, randomNullifier, setup } from './fixtures';

describe('fixtures', () => {
  it('packs state the way the SDK decodes it', () => {
    expect(convertRevealBigIntToString(packState('Delhi'))).toBe('Delhi');
  });
});

describe('intake: happy path', () => {
  it('records exactly one application and one claim after server-side verification', async () => {
    const { db, intake, cycle, verifyProof } = setup();
    const draft = createDraft(db, cycle.id);
    const nullifier = randomNullifier();

    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft, { nullifier }),
      form: FORM,
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('expected success');
    expect(result.applicationId).toMatch(/^OC-/);

    expect(verifyProof).toHaveBeenCalledTimes(1);
    const [pcd, useTestAadhaar] = verifyProof.mock.calls[0];
    expect(useTestAadhaar).toBe(true);
    expect(pcd.proof.nullifier).toBe(nullifier);

    const apps = listApplications(db, cycle.id);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      id: result.applicationId,
      status: 'pending',
      householdSize: 4,
    });
    expect(count(db, 'claims')).toBe(1);
    expect(db.prepare('SELECT nullifier FROM claims').get()).toEqual({ nullifier });
    expect(getDraft(db, draft.draftId)?.usedAt).not.toBeNull();
    expect(getStats(db, cycle.id)).toEqual({
      verified: 1,
      duplicatesTurnedAway: 0,
      pending: 1,
      approved: 0,
      rejected: 0,
    });
  });

  it('passes the configured test-mode flag to the verifier', async () => {
    const { db, intake, cycle, verifyProof } = setup({ config: { useTestAadhaar: false } });
    const draft = createDraft(db, cycle.id);
    await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft),
      form: FORM,
    });
    expect(verifyProof.mock.calls[0][1]).toBe(false);
  });

  it('stores no Aadhaar data or proof in the applications table', () => {
    const { db } = setup();
    const columns = (db.prepare('PRAGMA table_info(applications)').all() as { name: string }[])
      .map((c) => c.name)
      .sort();
    expect(columns).toEqual(
      [
        'created_at',
        'cycle_id',
        'draft_id',
        'household_size',
        'id',
        'reviewed_at',
        'status',
        'support_category',
      ].sort(),
    );
  });
});

describe('intake: one claim per human per cycle (nullifier)', () => {
  it('turns away a second application with the same nullifier in the same cycle', async () => {
    const { db, intake, cycle } = setup();
    const nullifier = randomNullifier();
    const first = createDraft(db, cycle.id);
    const second = createDraft(db, cycle.id);

    const ok = await intake.submit({
      draftId: first.draftId,
      serializedProof: makeSerializedProof(first, { nullifier }),
      form: FORM,
    });
    expect(ok.ok).toBe(true);

    const dup = await intake.submit({
      draftId: second.draftId,
      serializedProof: makeSerializedProof(second, { nullifier }),
      form: { householdSize: 2, supportCategory: 'health' },
    });
    expect(dup).toMatchObject({ ok: false, code: 'duplicate' });

    expect(listApplications(db, cycle.id)).toHaveLength(1);
    expect(count(db, 'claims')).toBe(1);
    expect(getStats(db, cycle.id).duplicatesTurnedAway).toBe(1);
    expect(getDraft(db, second.draftId)?.usedAt).toBeNull();

    const dupColumns = (
      db.prepare('PRAGMA table_info(duplicate_attempts)').all() as { name: string }[]
    ).map((c) => c.name);
    expect(dupColumns).not.toContain('nullifier');
  });

  it('accepts the same nullifier again in a new cycle', async () => {
    const { db, intake, cycle } = setup();
    const nullifier = randomNullifier();
    const draft1 = createDraft(db, cycle.id);
    expect(
      (
        await intake.submit({
          draftId: draft1.draftId,
          serializedProof: makeSerializedProof(draft1, { nullifier }),
          form: FORM,
        })
      ).ok,
    ).toBe(true);

    closeCycle(db, cycle.id);
    const cycle2 = openCycle(db, 'Second cycle');
    const draft2 = createDraft(db, cycle2.id);
    const again = await intake.submit({
      draftId: draft2.draftId,
      serializedProof: makeSerializedProof(draft2, { nullifier }),
      form: FORM,
    });
    expect(again.ok).toBe(true);
    expect(count(db, 'claims')).toBe(2);
  });

  it('has a UNIQUE(cycle_id, nullifier) backstop in the database', async () => {
    const { db, intake, cycle } = setup();
    const nullifier = randomNullifier();
    const draft = createDraft(db, cycle.id);
    await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft, { nullifier }),
      form: FORM,
    });

    // Bypass the service and try to take a second slot directly.
    const other = createDraft(db, cycle.id);
    db.prepare(
      `INSERT INTO applications (id, cycle_id, draft_id, household_size, support_category, created_at)
       VALUES ('OC-MANUAL', ?, ?, 1, 'food', ?)`,
    ).run(cycle.id, other.draftId, Date.now());
    expect(() =>
      db
        .prepare(
          `INSERT INTO claims (cycle_id, nullifier, application_id, claimed_at) VALUES (?, ?, 'OC-MANUAL', ?)`,
        )
        .run(cycle.id, nullifier, Date.now()),
    ).toThrow(/UNIQUE constraint failed: claims\.cycle_id, claims\.nullifier/);
  });
});

describe('intake: nullifier seed is fixed by the server', () => {
  it('rejects a proof generated with a different seed without calling the verifier', async () => {
    const { db, intake, cycle, verifyProof } = setup();
    const draft = createDraft(db, cycle.id);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft, { nullifierSeed: '987654321' }),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'seed_mismatch' });
    expect(verifyProof).not.toHaveBeenCalled();
    expect(count(db, 'applications')).toBe(0);
  });
});

describe('intake: signal is bound to the server-issued draft', () => {
  it('rejects a proof made for draft A submitted with draft B', async () => {
    const { db, intake, cycle, verifyProof } = setup();
    const draftA = createDraft(db, cycle.id);
    const draftB = createDraft(db, cycle.id);
    const result = await intake.submit({
      draftId: draftB.draftId,
      serializedProof: makeSerializedProof(draftA),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'signal_mismatch' });
    expect(verifyProof).not.toHaveBeenCalled();
    expect(count(db, 'applications')).toBe(0);
  });
});

describe('intake: server-side proof verification', () => {
  it('rejects when the verifier returns false and records nothing', async () => {
    const { db, intake, cycle } = setup({ verifier: async () => false });
    const draft = createDraft(db, cycle.id);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid_proof' });
    expect(count(db, 'applications')).toBe(0);
    expect(count(db, 'claims')).toBe(0);
    expect(getDraft(db, draft.draftId)?.usedAt).toBeNull();
  });

  it('rejects when the verifier throws (e.g. public key mismatch)', async () => {
    const { db, intake, cycle } = setup({
      verifier: async () => {
        throw new Error('VerificationError: public key mismatch.');
      },
    });
    const draft = createDraft(db, cycle.id);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid_proof' });
    expect(count(db, 'applications')).toBe(0);
  });

  it('rejects a QR signed longer ago than the configured max age (plus hour rounding)', async () => {
    const { db, intake, cycle } = setup();
    const draft = createDraft(db, cycle.id);
    const stale = String(Math.floor(Date.now() / 1000) - 3600 - QR_TIMESTAMP_ROUNDING_SECONDS - 1);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft, { timestamp: stale }),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'stale_qr' });
  });

  it('accepts a fresh QR whose circuit timestamp was rounded down to the hour', async () => {
    // Regression: the circuit floors the signing time to the hour, so a QR signed minutes ago
    // can look up to 59 minutes older than it is. With a 1 hour limit it must still be accepted.
    const { db, intake, cycle } = setup();
    const draft = createDraft(db, cycle.id);
    const roundedDown = String(Math.floor(Date.now() / 1000) - 3600 - 1800);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft, { timestamp: roundedDown }),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe('intake: cycle closed mid-submission', () => {
  it('re-checks the cycle inside the transaction when it closes during verification', async () => {
    let closeDuringVerify = () => {};
    const env = setup({
      verifier: async () => {
        closeDuringVerify(); // a volunteer closes the cycle while the proof is being verified
        return true;
      },
    });
    closeDuringVerify = () => {
      closeCycle(env.db, env.cycle.id);
    };
    const draft = createDraft(env.db, env.cycle.id);
    const result = await env.intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'cycle_closed' });
    expect(count(env.db, 'applications')).toBe(0);
    expect(count(env.db, 'claims')).toBe(0);
    expect(count(env.db, 'duplicate_attempts')).toBe(0);
    expect(getDraft(env.db, draft.draftId)?.usedAt).toBeNull();
  });
});

describe('intake: eligibility comes from the verified proof outputs', () => {
  it.each([
    ['under 18', { ageAbove18: '0' }],
    ['other state', { state: packState('Kerala') }],
    ['state not revealed', { state: '0' }],
  ])('rejects %s', async (_label, overrides) => {
    const { db, intake, cycle } = setup();
    const draft = createDraft(db, cycle.id);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft, overrides),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'ineligible' });
    expect(count(db, 'applications')).toBe(0);
  });

  it('ignores the client-built claim object', async () => {
    const { db, intake, cycle } = setup();
    const draft = createDraft(db, cycle.id);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft, {
        ageAbove18: '0',
        claim: {
          pubKey: [],
          signalHash: '1',
          ageAbove18: true,
          gender: null,
          pincode: null,
          state: 'Delhi',
        },
      }),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'ineligible' });
  });
});

describe('intake: drafts, cycles and input validation', () => {
  it('rejects re-use of a submitted draft', async () => {
    const { db, intake, cycle } = setup();
    const draft = createDraft(db, cycle.id);
    await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft),
      form: FORM,
    });
    const again = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft),
      form: FORM,
    });
    expect(again).toMatchObject({ ok: false, code: 'draft_used' });
    expect(count(db, 'applications')).toBe(1);
  });

  it('rejects a draft the server never issued', async () => {
    const { db, intake, cycle } = setup();
    const draft = createDraft(db, cycle.id);
    const result = await intake.submit({
      draftId: 'not-a-real-draft',
      serializedProof: makeSerializedProof(draft),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'unknown_draft' });
  });

  it('rejects submissions once the cycle is closed', async () => {
    const { db, intake, cycle } = setup();
    const draft = createDraft(db, cycle.id);
    closeCycle(db, cycle.id);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'cycle_closed' });
  });

  it('rejects an expired draft', async () => {
    let t = Date.now();
    const { db, intake, cycle } = setup({ now: () => t });
    const draft = createDraft(db, cycle.id, t);
    t += DRAFT_TTL_MS + 1;
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft, {}, t),
      form: FORM,
    });
    expect(result).toMatchObject({ ok: false, code: 'draft_expired' });
  });

  it.each([
    ['not JSON', 'not json'],
    ['missing proof', JSON.stringify({ type: 'anon-aadhaar', claim: {} })],
    ['non-decimal field', null],
  ])('rejects a malformed proof (%s)', async (_label, raw) => {
    const { db, intake, cycle, verifyProof } = setup();
    const draft = createDraft(db, cycle.id);
    const serializedProof = raw ?? makeSerializedProof(draft, { nullifier: 'abc' });
    const result = await intake.submit({ draftId: draft.draftId, serializedProof, form: FORM });
    expect(result).toMatchObject({ ok: false, code: 'malformed_proof' });
    expect(verifyProof).not.toHaveBeenCalled();
  });

  it.each([
    ['household size 0', { householdSize: 0, supportCategory: 'food' }],
    ['unknown category', { householdSize: 3, supportCategory: 'cash' }],
    ['missing', undefined],
  ])('rejects a bad form (%s)', async (_label, form) => {
    const { db, intake, cycle } = setup();
    const draft = createDraft(db, cycle.id);
    const result = await intake.submit({
      draftId: draft.draftId,
      serializedProof: makeSerializedProof(draft),
      form,
    });
    expect(result).toMatchObject({ ok: false, code: 'bad_form' });
  });
});
