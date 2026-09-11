import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, getSessionSecret, verifySessionToken } from './session';

/**
 * Volunteer access control. Every check happens on the server: the session cookie is httpOnly,
 * HMAC-signed with SESSION_SECRET and SameSite=Strict (so cross-site form posts carry no session).
 */

/** For server components (e.g. app/volunteer/page.tsx). */
export function isVolunteer(): boolean {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, getSessionSecret());
}

/** For route handlers: true only if the request carries a valid, unexpired volunteer session. */
export function requireVolunteer(req: NextRequest): boolean {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, getSessionSecret());
}

/** Placeholder values copied from .env.example must never unlock the dashboard. */
export function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('replace-with-');
}

/** 303 back to the dashboard (optionally with a short error code the page renders). */
export function redirectToDashboard(req: NextRequest, error?: string): NextResponse {
  const url = new URL('/volunteer', req.url);
  if (error) url.searchParams.set('error', error);
  return NextResponse.redirect(url, 303);
}

/** Response for an unauthenticated request to a protected volunteer endpoint. */
export function unauthorized(req: NextRequest): NextResponse {
  const wantsHtml = req.headers.get('accept')?.includes('text/html');
  return wantsHtml
    ? redirectToDashboard(req, 'session')
    : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
