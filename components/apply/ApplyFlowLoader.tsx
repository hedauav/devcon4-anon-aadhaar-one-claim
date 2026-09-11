'use client';

import dynamic from 'next/dynamic';

export type ApplyFlowProps = { useTestAadhaar: boolean; eligibleState: string };

// The Anon Aadhaar prover touches `window` / localStorage, so it only ever runs in the browser.
const ApplyFlow = dynamic(() => import('./ApplyFlow'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
      Loading the private prover…
    </div>
  ),
});

export default function ApplyFlowLoader(props: ApplyFlowProps) {
  return <ApplyFlow {...props} />;
}
