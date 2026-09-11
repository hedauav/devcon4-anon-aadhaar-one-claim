import Link from 'next/link';
import ApplyFlowLoader from '@/components/apply/ApplyFlowLoader';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getOpenCycle } from '@/lib/store';

export const dynamic = 'force-dynamic';

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl bg-white p-8 text-center ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="mt-2 text-slate-600">{children}</div>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-emerald-700">
        Back to home
      </Link>
    </div>
  );
}

export default function ApplyPage() {
  let config;
  try {
    config = loadConfig();
  } catch {
    return (
      <Notice title="Not ready yet">
        The office has not finished configuring this server. Please check back later.
      </Notice>
    );
  }

  const cycle = getOpenCycle(getDb());
  if (!cycle) {
    return (
      <Notice title="Applications are closed">
        There is no open application cycle right now. The office will share a link when the next one
        opens.
      </Notice>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          {cycle.name}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Apply for this cycle</h1>
        <p className="mt-2 text-slate-600">
          Who can apply: residents of <strong>{config.eligibleState}</strong> aged{' '}
          <strong>18 or older</strong>. One application per person per cycle.
        </p>
        {config.useTestAadhaar && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            Test mode: this office accepts test Aadhaar QR codes only.
          </p>
        )}
      </div>
      <ApplyFlowLoader
        useTestAadhaar={config.useTestAadhaar}
        eligibleState={config.eligibleState}
      />
    </div>
  );
}
