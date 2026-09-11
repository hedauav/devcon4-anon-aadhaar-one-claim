import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';
import { redirectToDashboard } from '@/lib/volunteer-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const res = redirectToDashboard(req);
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
