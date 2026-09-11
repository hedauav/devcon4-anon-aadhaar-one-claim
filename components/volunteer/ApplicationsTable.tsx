import { SUPPORT_LABELS } from '@/lib/categories';
import type { Application, ApplicationStatus } from '@/lib/store';
import { formatTime } from './format';

const BADGE: Record<ApplicationStatus, string> = {
  pending: 'bg-sky-50 text-sky-700 ring-sky-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function DecisionButton({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) {
  const approve = decision === 'approved';
  return (
    <form method="post" action={`/api/volunteer/applications/${encodeURIComponent(id)}`}>
      <input type="hidden" name="decision" value={decision} />
      <button
        type="submit"
        className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${
          approve
            ? 'text-emerald-800 ring-emerald-300 hover:bg-emerald-50'
            : 'text-rose-700 ring-rose-300 hover:bg-rose-50'
        }`}
      >
        {approve ? 'Approve' : 'Reject'}
      </button>
    </form>
  );
}

export function ApplicationsTable({ applications }: { applications: Application[] }) {
  if (applications.length === 0) {
    return (
      <p className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        No verified applications yet. They appear here as soon as an applicant&apos;s proof is
        accepted.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Household</th>
            <th className="px-4 py-3">Support</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {applications.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-900">{a.id}</td>
              <td className="px-4 py-3 tabular-nums">{a.householdSize}</td>
              <td className="px-4 py-3">
                {SUPPORT_LABELS[a.supportCategory] ?? a.supportCategory}
              </td>
              <td className="whitespace-nowrap px-4 py-3">{formatTime(a.createdAt)}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ${BADGE[a.status]}`}
                >
                  {a.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  {a.status !== 'approved' ? (
                    <DecisionButton id={a.id} decision="approved" />
                  ) : null}
                  {a.status !== 'rejected' ? (
                    <DecisionButton id={a.id} decision="rejected" />
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
