import { NextResponse, type NextRequest } from 'next/server';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { draftLimiter, throttleKey } from '@/lib/rate-limit';
import { signalHashOf } from '@/lib/signal';
import { createDraft, getOpenCycle } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start an application: the SERVER creates a draft (random draftId in the open cycle) and derives
 * the signal the applicant's proof must commit to. The nullifier seed handed back is the office's
 * fixed NULLIFIER_SEED — the browser uses it, but the server re-checks it on submission.
 */
export async function POST(req: NextRequest) {
  const limited = draftLimiter(throttleKey(req.headers));
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  let nullifierSeed: bigint;
  try {
    nullifierSeed = loadConfig().nullifierSeed;
  } catch {
    return NextResponse.json(
      { error: 'The office has not finished configuring this server.' },
      { status: 500 },
    );
  }

  const db = getDb();
  const cycle = getOpenCycle(db);
  if (!cycle) {
    return NextResponse.json({ error: 'No application cycle is open right now.' }, { status: 409 });
  }

  const draft = createDraft(db, cycle.id);
  return NextResponse.json(
    {
      draftId: draft.draftId,
      cycleName: cycle.name,
      signal: draft.signal,
      signalHash: signalHashOf(draft.signal),
      nullifierSeed: nullifierSeed.toString(),
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
