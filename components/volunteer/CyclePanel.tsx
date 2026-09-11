import type { Cycle } from '@/lib/store';
import { CopyLink } from './CopyLink';
import { formatTime } from './format';

export function CyclePanel({ cycle, applyUrl }: { cycle: Cycle | null; applyUrl: string }) {
  if (!cycle) {
    return (
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">No cycle is open</h2>
        <p className="mt-1 text-sm text-slate-600">
          Open a cycle to start accepting applications. Each person can take one slot per cycle.
        </p>
        <form
          method="post"
          action="/api/volunteer/cycles"
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <input type="hidden" name="action" value="open" />
          <input
            type="text"
            name="name"
            required
            maxLength={80}
            placeholder="October 2026 ration support"
            aria-label="Cycle name"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
          >
            Open cycle
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Open cycle
          </p>
          <h2 className="text-lg font-semibold text-slate-900">{cycle.name}</h2>
          <p className="text-sm text-slate-500">Opened {formatTime(cycle.openedAt)}</p>
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">
            Close cycle…
          </summary>
          <form method="post" action="/api/volunteer/cycles" className="mt-2">
            <input type="hidden" name="action" value="close" />
            <input type="hidden" name="cycleId" value={cycle.id} />
            <button
              type="submit"
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              Yes, stop accepting applications
            </button>
          </form>
        </details>
      </div>
      <div className="mt-4">
        <p className="mb-1 text-sm font-medium text-slate-700">Share this link with applicants</p>
        <CopyLink url={applyUrl} />
      </div>
    </section>
  );
}
