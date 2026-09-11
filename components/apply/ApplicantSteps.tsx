'use client';

import { LogInWithAnonAadhaar, useAnonAadhaar } from '@anon-aadhaar/react';
import type { FieldsToRevealArray } from '@anon-aadhaar/core';
import { useMemo, useState } from 'react';
import type { SupportCategory } from '@/lib/categories';
import IntakeQuestions, { type IntakeAnswers } from './IntakeQuestions';
import StepHeader from './StepHeader';

/**
 * Privacy: ask the circuit to reveal ONLY what the eligibility rule needs (18+ and state).
 * Gender and PIN code are never requested.
 */
const FIELDS_TO_REVEAL: FieldsToRevealArray = ['revealAgeAbove18', 'revealState'];

/** Issued by POST /api/drafts. The signal and seed come from the server, not from this page. */
type DraftTicket = {
  draftId: string;
  cycleName: string;
  signal: string;
  signalHash: string;
  nullifierSeed: string;
};

type Outcome = { ok: true; applicationId: string } | { ok: false; message: string };

export default function ApplicantSteps({ eligibleState }: { eligibleState: string }) {
  const [anonAadhaar, startReq] = useAnonAadhaar();
  const [answers, setAnswers] = useState<IntakeAnswers>({ householdSize: 1, supportCategory: '' });
  const [draft, setDraft] = useState<DraftTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // The serialized proof generated for THIS draft. Anything else the SDK remembers in
  // localStorage (e.g. from an earlier attempt) is ignored.
  const proofForDraft = useMemo(() => {
    if (!draft || anonAadhaar.status !== 'logged-in') return null;
    const proofs = Object.values(anonAadhaar.anonAadhaarProofs).reverse();
    for (const serialized of proofs) {
      try {
        const parsed = JSON.parse(serialized.pcd) as { proof?: { signalHash?: string } };
        if (parsed.proof?.signalHash === draft.signalHash) return serialized.pcd;
      } catch {
        // not a proof we can use
      }
    }
    return null;
  }, [anonAadhaar, draft]);

  const clearProverState = () => {
    if (anonAadhaar.status === 'logged-in') startReq({ type: 'logout' });
  };

  async function startDraft() {
    if (!answers.supportCategory) {
      setError('Choose the kind of support you need.');
      return;
    }
    setError(null);
    setBusy(true);
    clearProverState();
    try {
      const res = await fetch('/api/drafts', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start an application.');
      setDraft(data as DraftTicket);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start an application.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!draft || !proofForDraft) return;
    setBusy(true);
    setError(null);
    try {
      // Everything that leaves this device: the draft id, the zero-knowledge proof and the two
      // intake answers. No QR data, certificate, name, photo or Aadhaar number.
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draft.draftId,
          proof: proofForDraft,
          form: {
            householdSize: answers.householdSize,
            supportCategory: answers.supportCategory as SupportCategory,
          },
        }),
      });
      const data = await res.json();
      setOutcome(
        data.ok
          ? { ok: true, applicationId: data.applicationId }
          : { ok: false, message: data.message ?? 'The application could not be recorded.' },
      );
      startReq({ type: 'logout' }); // drop the proof from this browser's storage
    } catch {
      setError('Network error. Your proof is still here — try submitting again.');
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    clearProverState();
    setDraft(null);
    setOutcome(null);
    setError(null);
  }

  if (outcome) {
    return outcome.ok ? (
      <div className="rounded-xl bg-white p-6 ring-1 ring-emerald-200">
        <h2 className="text-xl font-semibold text-emerald-800">Application received</h2>
        <p className="mt-2 text-slate-600">
          Your eligibility was verified and your slot in this cycle is reserved. Keep this reference
          — it is the only thing that links you to your application:
        </p>
        <p className="mt-4 select-all rounded-lg bg-emerald-50 px-4 py-3 text-center font-mono text-2xl tracking-wider text-emerald-900">
          {outcome.applicationId}
        </p>
      </div>
    ) : (
      <div className="rounded-xl bg-white p-6 ring-1 ring-rose-200">
        <h2 className="text-xl font-semibold text-rose-800">Application not recorded</h2>
        <p className="mt-2 text-slate-700">{outcome.message}</p>
        <button
          onClick={startOver}
          className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Start over
        </button>
      </div>
    );
  }

  const step = !draft ? 1 : proofForDraft ? 3 : 2;

  return (
    <div className="space-y-4">
      <StepHeader current={step} />

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {!draft && (
        <div className="space-y-4 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <IntakeQuestions value={answers} onChange={setAnswers} />
          <button
            onClick={startDraft}
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Starting…' : 'Continue to eligibility proof'}
          </button>
        </div>
      )}

      {draft && !proofForDraft && (
        <div className="space-y-4 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="font-semibold">Prove you are eligible</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Upload your Aadhaar secure QR code in the window that opens.</li>
            <li>It is read only inside this browser. It is never uploaded.</li>
            <li>The proof reveals just two facts: you are 18+ and you live in {eligibleState}.</li>
            <li>Generating the proof takes one to three minutes. Keep this tab open.</li>
          </ul>
          <div className="flex justify-center py-2">
            <LogInWithAnonAadhaar
              nullifierSeed={BigInt(draft.nullifierSeed)}
              signal={draft.signal}
              fieldsToReveal={FIELDS_TO_REVEAL}
            />
          </div>
          {anonAadhaar.status === 'logging-in' && (
            <p className="text-center text-sm text-slate-500">Generating your proof…</p>
          )}
        </div>
      )}

      {draft && proofForDraft && (
        <div className="space-y-4 rounded-xl bg-white p-6 ring-1 ring-emerald-200">
          <h2 className="font-semibold text-emerald-800">Proof ready</h2>
          <p className="text-sm text-slate-600">This is everything that will be sent:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>the zero-knowledge proof (no name, number, photo or address inside)</li>
            <li>your household size and support type</li>
            <li>the application draft number the office gave this page</li>
          </ul>
          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Verifying…' : 'Submit application'}
          </button>
        </div>
      )}
    </div>
  );
}
