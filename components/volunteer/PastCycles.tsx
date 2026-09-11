import type { Cycle, CycleStats } from '@/lib/store';
import { formatTime } from './format';

export function PastCycles({ cycles }: { cycles: { cycle: Cycle; stats: CycleStats }[] }) {
  if (cycles.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Past cycles</h2>
      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {cycles.map(({ cycle, stats }) => (
          <li
            key={cycle.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <div>
              <p className="font-medium text-slate-900">{cycle.name}</p>
              <p className="text-xs text-slate-500">
                {formatTime(cycle.openedAt)} – {formatTime(cycle.closedAt)}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-emerald-700">{stats.verified}</span> verified ·{' '}
              <span className="font-semibold text-amber-600">{stats.duplicatesTurnedAway}</span>{' '}
              duplicates · <span className="font-semibold">{stats.approved}</span> approved ·{' '}
              <span className="font-semibold text-rose-600">{stats.rejected}</span> rejected
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
