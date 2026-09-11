import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { reviewApplication } from '@/lib/store';
import { redirectToDashboard, requireVolunteer, unauthorized } from '@/lib/volunteer-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPLICATION_ID = /^OC-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

/** Record a volunteer's review decision. Volunteers only (checked server-side). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requireVolunteer(req)) return unauthorized(req);

  const form = await req.formData();
  const decision = form.get('decision');
  if (decision !== 'approved' && decision !== 'rejected') {
    return redirectToDashboard(req, 'decision');
  }
  if (!APPLICATION_ID.test(params.id) || !reviewApplication(getDb(), params.id, decision)) {
    return redirectToDashboard(req, 'notfound');
  }
  return redirectToDashboard(req);
}
