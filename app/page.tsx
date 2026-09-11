import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getOpenCycle } from '@/lib/store';

export const dynamic = 'force-dynamic';

const PRINCIPLES = [
  {
    title: 'You prove it on your phone',
    body: 'Your Aadhaar QR is read inside your own browser to build a zero-knowledge proof. The QR, your name and your number never leave the device.',
  },
  {
    title: 'We learn one yes/no fact',
    body: 'The proof reveals only that you are 18 or older and live in the eligible state. Gender, PIN code and everything else stay hidden.',
  },
  {
    title: 'One application per person',
    body: 'Each proof carries a pseudonymous nullifier unique to you and this office. A second application from the same person in a cycle is turned away.',
  },
];

export default function HomePage() {
  const cycle = getOpenCycle(getDb());

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Benefit intake
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Nobody needs your Aadhaar number.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          Prove you are eligible for this cycle without handing over who you are. The office checks
          the proof, records that a slot was taken, and never holds your Aadhaar data.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href="/apply"
            className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            Start an application
          </Link>
          <Link
            href="/volunteer"
            className="rounded-lg bg-white px-5 py-2.5 font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >
            Volunteer dashboard
          </Link>
          <span className="text-sm text-slate-500">
            {cycle ? (
              <>
                Open now: <strong className="text-slate-700">{cycle.name}</strong>
              </>
            ) : (
              'No cycle is open right now.'
            )}
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{p.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
