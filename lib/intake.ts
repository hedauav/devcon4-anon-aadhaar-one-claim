import {
  AnonAadhaarCore,
  convertRevealBigIntToString,
  deserialize,
  type AnonAadhaarProof,
} from '@anon-aadhaar/core';
import { z } from 'zod';
import type { AppConfig } from './config';
import type { DB } from './db';
import { signalHashOf } from './signal';
import { DRAFT_TTL_MS, SUPPORT_CATEGORIES, getCycle, getDraft, newApplicationId } from './store';

/**
 * Intake service: the only code path that records an application.
 *
 * It is pure with respect to its dependencies (database handle, config, proof verifier, clock),
 * so tests can inject a fake verifier while the route handler wires the real Anon Aadhaar
 * `verify()` (see lib/verifier.ts and app/api/applications/route.ts).
 */

export type ProofVerifier = (pcd: AnonAadhaarCore, useTestAadhaar: boolean) => Promise<boolean>;

export type IntakeDeps = {
  db: DB;
  config: AppConfig;
  verifyProof: ProofVerifier;
  now?: () => number;
};

/** Non-identifying intake answers. Nothing here can single out a person. */
export const intakeFormSchema = z.object({
  householdSize: z.number().int().min(1).max(30),
  supportCategory: z.enum(SUPPORT_CATEGORIES),
});
export type IntakeForm = z.infer<typeof intakeFormSchema>;

export type SubmitInput = {
  draftId: string;
  /** `SerializedPCD.pcd` string produced by @anon-aadhaar/react in the applicant's browser. */
  serializedProof: string;
  form: unknown;
};

export type RejectionCode =
  | 'bad_form'
  | 'unknown_draft'
  | 'draft_used'
  | 'draft_expired'
  | 'cycle_closed'
  | 'malformed_proof'
  | 'seed_mismatch'
  | 'signal_mismatch'
  | 'invalid_proof'
  | 'stale_qr'
  | 'ineligible'
  | 'duplicate';

export type SubmitResult =
  { ok: true; applicationId: string } | { ok: false; code: RejectionCode; message: string };

export const REJECTION_MESSAGES: Record<RejectionCode, string> = {
  bad_form: 'Please answer both intake questions.',
  unknown_draft: 'This application draft was not issued by the office. Start again.',
  draft_used: 'This application draft has already been submitted.',
  draft_expired: 'This application draft expired. Start a new one.',
  cycle_closed: 'This application cycle is closed.',
  malformed_proof: 'The proof could not be read.',
  seed_mismatch: 'The proof was not generated for this office.',
  signal_mismatch: 'The proof was generated for a different application.',
  invalid_proof: 'The proof did not verify.',
  stale_qr: 'Your Aadhaar QR code is too old. Download a fresh one and try again.',
  ineligible: 'The proof does not meet this cycle’s eligibility rules.',
  duplicate: 'You already have an application in this cycle. Only one is allowed per person.',
};

const reject = (code: RejectionCode): SubmitResult => ({
  ok: false,
  code,
  message: REJECTION_MESSAGES[code],
});

/** The Anon Aadhaar circuit exposes the QR signing time rounded down to the hour. */
export const QR_TIMESTAMP_ROUNDING_SECONDS = 3600;

const decimal = z.string().regex(/^[0-9]{1,78}$/);
const proofSchema = z.object({
  groth16Proof: z.object({
    pi_a: z.array(decimal).length(3),
    pi_b: z.array(z.array(decimal).length(2)).length(3),
    pi_c: z.array(decimal).length(3),
    protocol: z.literal('groth16'),
    curve: z.string(),
  }),
  pubkeyHash: decimal,
  timestamp: decimal,
  nullifierSeed: decimal,
  nullifier: decimal,
  signalHash: decimal,
  ageAbove18: decimal,
  gender: decimal,
  pincode: decimal,
  state: decimal,
});

/**
 * Parse the client-sent proof. Only the `proof` (the public signals + groth16 points) is kept;
 * the client-built `claim` object is discarded because nothing in it is verified.
 */
async function parseProof(serialized: string): Promise<AnonAadhaarProof | null> {
  if (typeof serialized !== 'string' || serialized.length > 20_000) return null;
  try {
    const parsed = (await deserialize(serialized)) as unknown as { proof?: unknown };
    const result = proofSchema.safeParse(parsed?.proof);
    return result.success ? (result.data as AnonAadhaarProof) : null;
  } catch {
    return null;
  }
}

/** Has this human (as an app-scoped nullifier) already taken a slot in this cycle? */
export function hasTakenSlot(db: DB, cycleId: string, nullifier: string): boolean {
  return (
    db
      .prepare(`SELECT 1 FROM claims WHERE cycle_id = ? AND nullifier = ?`)
      .get(cycleId, nullifier) !== undefined
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    String((err as { code: unknown }).code).startsWith('SQLITE_CONSTRAINT')
  );
}

export function createIntake({ db, config, verifyProof, now = Date.now }: IntakeDeps) {
  function recordDuplicate(cycleId: string, at: number) {
    // Store only that a duplicate happened — no nullifier, no identity.
    db.prepare(`INSERT INTO duplicate_attempts (cycle_id, at) VALUES (?, ?)`).run(cycleId, at);
  }

  /**
   * INVARIANT (one claim per human per cycle): look up (cycle_id, nullifier) BEFORE recording and
   * reject if present; lookup + inserts run in one SQLite transaction, and UNIQUE(cycle_id,
   * nullifier) on `claims` is the backstop. Duplicates are keyed ONLY on the proof's nullifier —
   * never on email, wallet, session, IP or device.
   */
  const recordOnce = db.transaction(
    (args: {
      cycleId: string;
      draftId: string;
      nullifier: string;
      form: IntakeForm;
      at: number;
    }): SubmitResult => {
      // Re-check inside the transaction: the cycle may have closed while the proof was verifying.
      const cycleRow = db.prepare(`SELECT status FROM cycles WHERE id = ?`).get(args.cycleId) as
        { status: string } | undefined;
      if (cycleRow?.status !== 'open') return reject('cycle_closed');

      if (hasTakenSlot(db, args.cycleId, args.nullifier)) {
        recordDuplicate(args.cycleId, args.at);
        return reject('duplicate');
      }
      const consumed = db
        .prepare(`UPDATE drafts SET used_at = ? WHERE draft_id = ? AND used_at IS NULL`)
        .run(args.at, args.draftId);
      if (consumed.changes !== 1) return reject('draft_used');

      const applicationId = newApplicationId();
      db.prepare(
        `INSERT INTO applications (id, cycle_id, draft_id, household_size, support_category, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        applicationId,
        args.cycleId,
        args.draftId,
        args.form.householdSize,
        args.form.supportCategory,
        args.at,
      );
      db.prepare(
        `INSERT INTO claims (cycle_id, nullifier, application_id, claimed_at) VALUES (?, ?, ?, ?)`,
      ).run(args.cycleId, args.nullifier, applicationId, args.at);
      return { ok: true, applicationId };
    },
  );

  async function submit(input: SubmitInput): Promise<SubmitResult> {
    const form = intakeFormSchema.safeParse(input.form);
    if (!form.success) return reject('bad_form');

    // The draft must be one this server issued, unused, unexpired, in an open cycle.
    const draft = typeof input.draftId === 'string' ? getDraft(db, input.draftId) : null;
    if (!draft) return reject('unknown_draft');
    if (draft.usedAt !== null) return reject('draft_used');
    if (now() - draft.createdAt > DRAFT_TTL_MS) return reject('draft_expired');
    const cycle = getCycle(db, draft.cycleId);
    if (!cycle || cycle.status !== 'open') return reject('cycle_closed');

    const proof = await parseProof(input.serializedProof);
    if (!proof) return reject('malformed_proof');

    // INVARIANT (nullifier seed fixed by the app): the seed comes from the server env
    // (config.nullifierSeed = NULLIFIER_SEED). The seed inside the client-sent proof is only
    // COMPARED to it — never used or trusted on its own.
    if (BigInt(proof.nullifierSeed) !== config.nullifierSeed) return reject('seed_mismatch');

    // INVARIANT (signal bound to this application): the proof's signalHash must equal the SDK
    // hash of the signal the server derived for THIS draft (cycleId + draftId).
    if (BigInt(proof.signalHash) !== BigInt(signalHashOf(draft.signal))) {
      return reject('signal_mismatch');
    }

    // INVARIANT (proof verified server-side): run the Anon Aadhaar groth16 verifier here, on the
    // server, before anything is recorded. No validity flag from the browser is ever consulted.
    // The public signals checked above (seed, signalHash) are inputs to this verification.
    const pcd = new AnonAadhaarCore(
      input.draftId,
      {
        pubKey: [],
        signalHash: proof.signalHash,
        ageAbove18: null,
        gender: null,
        pincode: null,
        state: null,
      },
      proof,
    );
    let valid = false;
    try {
      valid = await verifyProof(pcd, config.useTestAadhaar);
    } catch {
      valid = false; // e.g. the SDK throws on a public-key (issuer) mismatch
    }
    if (!valid) return reject('invalid_proof');

    // QR freshness. The circuit rounds the QR signing time DOWN to the hour, so a QR signed
    // minutes ago can carry a timestamp up to 59 minutes old; allow that rounding on top of the limit.
    const nowSeconds = Math.floor(now() / 1000);
    if (
      config.qrMaxAgeSeconds > 0 &&
      nowSeconds - Number(proof.timestamp) > config.qrMaxAgeSeconds + QR_TIMESTAMP_ROUNDING_SECONDS
    ) {
      return reject('stale_qr');
    }

    // INVARIANT (eligibility from the verified proof): read the circuit's revealed outputs
    // (ageAbove18, state) from the verified public signals — never from form fields, cookies or
    // the client-built `claim` object. Unrevealed fields are 0 and therefore fail.
    const isAdult = proof.ageAbove18 === '1';
    const revealedState = convertRevealBigIntToString(proof.state).trim().toLowerCase();
    if (!isAdult || revealedState !== config.eligibleState.trim().toLowerCase()) {
      return reject('ineligible');
    }

    const nullifier = BigInt(proof.nullifier).toString();
    try {
      return recordOnce({
        cycleId: cycle.id,
        draftId: draft.draftId,
        nullifier,
        form: form.data,
        at: now(),
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        recordDuplicate(cycle.id, now());
        return reject('duplicate');
      }
      throw err;
    }
  }

  return { submit };
}

export type Intake = ReturnType<typeof createIntake>;
