import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'One Claim · benefit intake with Anon Aadhaar',
  description:
    'Apply for a benefit cycle by proving eligibility with Anon Aadhaar. The office never sees your Aadhaar number.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block h-6 w-6 rounded-md bg-emerald-600" aria-hidden />
              One Claim
            </Link>
            <nav className="flex gap-5 text-sm font-medium text-slate-600">
              <Link href="/apply" className="hover:text-slate-900">
                Apply
              </Link>
              <Link href="/volunteer" className="hover:text-slate-900">
                Volunteers
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <p className="mx-auto max-w-5xl px-4 py-4 text-xs text-slate-500">
            Eligibility is proven with Anon Aadhaar zero-knowledge proofs. This office never
            receives or stores an Aadhaar number, QR code or name.
          </p>
        </footer>
      </body>
    </html>
  );
}
