'use client';

import { useState } from 'react';

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context): the link stays selectable below.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 select-all truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
