import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  getSessionSecret,
  passwordMatches,
} from '@/lib/session';
import { isPlaceholder, redirectToDashboard } from '@/lib/volunteer-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Volunteer login: compares against the server-side VOLUNTEER_PASSWORD. Never logs the input. */
export async function POST(req: NextRequest) {
  const expected = process.env.VOLUNTEER_PASSWORD;
  const secret = getSessionSecret();
  if (!secret || isPlaceholder(secret) || isPlaceholder(expected)) {
    return redirectToDashboard(req, 'config');
  }

  const form = await req.formData();
  const password = form.get('password');
  if (typeof password !== 'string' || !passwordMatches(password, expected)) {
    return redirectToDashboard(req, 'bad_passphrase');
  }

  const res = redirectToDashboard(req);
  res.cookies.set(SESSION_COOKIE, createSessionToken(secret), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
