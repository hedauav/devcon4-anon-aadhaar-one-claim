import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getDb } from '@/lib/db';
import { getOpenCycle, getStats, listApplications, listCycles } from '@/lib/store';
import { isVolunteer } from '@/lib/volunteer-auth';
import { ApplicationsTable } from '@/components/volunteer/ApplicationsTable';
import { CyclePanel } from '@/components/volunteer/CyclePanel';
import { LoginCard } from '@/components/volunteer/LoginCard';
import { PastCycles } from '@/components/volunteer/PastCycles';
import { StatCard } from '@/components/volunteer/StatCard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Volunteer dashboard · One Claim' };

const ERRORS: Record<string, string> = {
  config:
    'The dashboard is not configured. Set VOLUNTEER_PASSWORD and a 32+ character SESSION_SECRET in .env.local.',
  bad_passphrase: 'That passphrase is not correct.',
  rate_limited: 'Too many sign-in attempts. Wait 15 minutes and try again.',
  session: 'Your session expired. Please sign in again.',
  name: 'Give the cycle a name (1–80 characters).',
  cycle_open: 'Close the current cycle before opening a new one.',
  notfound: 'That item no longer exists or was already updated.',
  decision: 'Unknown review decision.',
  action: 'Unknown action.',
};

async function applicantLink(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}/apply`;
}

export default async function VolunteerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error: rawError } = await searchParams;
  const code = typeof rawError === 'string' ? rawError : undefined;
  const error = code ? ERRORS[code] : undefined;

  // Server-side gate: nothing below is rendered (or queried) without a valid volunteer session.
  if (!(await isVolunteer())) return <LoginCard error={error} />;
  const applyUrl = await applicantLink();

  const db = getDb();
  const openCycle = getOpenCycle(db);
  const cycles = listCycles(db);
  const current = openCycle ?? cycles[0] ?? null;
  const stats = current ? getStats(db, current.id) : null;
  const applications = current ? listApplications(db, current.id) : [];
  const past = cycles
    .filter((c) => c.id !== current?.id)
    .map((cycle) => ({ cycle, stats: getStats(db, cycle.id) }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Volunteer dashboard</h1>
          <p className="text-sm text-slate-600">
            Verified entries, duplicates turned away, and what is left to review.
          </p>
        </div>
        <form method="post" action="/api/volunteer/logout">
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <CyclePanel cycle={openCycle} applyUrl={applyUrl} />

      {current && stats ? (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {current.status === 'open' ? 'This cycle' : `Most recent cycle: ${current.name}`}
            </h2>
            {current.status === 'closed' ? (
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Closed
              </span>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Verified entries"
              value={stats.verified}
              tone="emerald"
              hint="Proof verified, one slot each"
            />
            <StatCard
              label="Duplicates turned away"
              value={stats.duplicatesTurnedAway}
              tone="amber"
              hint="Same person tried again this cycle"
            />
            <StatCard
              label="Left to review"
              value={stats.pending}
              tone="sky"
              hint="Waiting for a volunteer decision"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:max-w-md">
            <StatCard label="Approved" value={stats.approved} tone="emerald" size="sm" />
            <StatCard label="Rejected" value={stats.rejected} tone="rose" size="sm" />
          </div>
          <ApplicationsTable applications={applications} />
        </section>
      ) : null}

      <PastCycles cycles={past} />

      <p className="rounded-lg bg-slate-100 px-4 py-3 text-xs text-slate-600">
        Privacy: this office never receives or stores an Aadhaar number, QR code, name or photo.
        Each slot is recorded only as an app-scoped nullifier from the applicant&apos;s
        zero-knowledge proof, and duplicates are counted without storing who attempted them.
      </p>
    </div>
  );
}
