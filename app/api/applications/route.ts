import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { createIntake, type RejectionCode } from '@/lib/intake';
import { verifyAnonAadhaar } from '@/lib/verifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 32_000;

/**
 * The only fields an applicant's browser may send: the draft id, the serialized proof and the two
 * non-identifying intake answers. `.strict()` refuses anything else (a QR payload, a certificate,
 * a name...), so raw Aadhaar data cannot even arrive here.
 */
const bodySchema = z
  .object({
    draftId: z.string().uuid(),
    proof: z.string().min(1).max(20_000),
    form: z.object({ householdSize: z.number(), supportCategory: z.string() }).strict(),
  })
  .strict();

const STATUS_BY_CODE: Partial<Record<RejectionCode, number>> = {
  duplicate: 409,
  draft_used: 409,
  cycle_closed: 409,
  ineligible: 403,
  seed_mismatch: 422,
  signal_mismatch: 422,
  invalid_proof: 422,
  malformed_proof: 422,
  stale_qr: 422,
};

/**
 * Record an application. This handler is the recording path: it runs the real Anon Aadhaar
 * `verify()` on the server (via lib/verifier.ts inside lib/intake.ts) before anything is stored.
 * The request body is never logged — it contains the proof.
 */
export async function POST(req: NextRequest) {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, code: 'too_large' }, { status: 413 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'bad_request' }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { ok: false, code: 'bad_request', message: 'Send only draftId, proof and form.' },
      { status: 400 },
    );
  }

  let config;
  try {
    config = loadConfig();
  } catch {
    return NextResponse.json({ ok: false, code: 'server_config' }, { status: 500 });
  }

  const intake = createIntake({ db: getDb(), config, verifyProof: verifyAnonAadhaar });
  try {
    const result = await intake.submit({
      draftId: body.data.draftId,
      serializedProof: body.data.proof,
      form: body.data.form,
    });
    if (result.ok) {
      return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(result, { status: STATUS_BY_CODE[result.code] ?? 400 });
  } catch (err) {
    // Log the error class only; never the request, the proof or its public signals.
    console.error('[applications] intake failed:', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ ok: false, code: 'server_error' }, { status: 500 });
  }
}
