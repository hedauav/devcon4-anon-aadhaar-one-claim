import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { CycleError, closeCycle, openCycle } from '@/lib/store';
import { redirectToDashboard, requireVolunteer, unauthorized } from '@/lib/volunteer-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Open or close an application cycle. Volunteers only (checked server-side). */
export async function POST(req: NextRequest) {
  if (!requireVolunteer(req)) return unauthorized(req);

  const form = await req.formData();
  const action = form.get('action');
  const db = getDb();

  if (action === 'open') {
    const name = form.get('name');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      return redirectToDashboard(req, 'name');
    }
    try {
      openCycle(db, name);
    } catch (err) {
      if (err instanceof CycleError) return redirectToDashboard(req, 'cycle_open');
      throw err;
    }
    return redirectToDashboard(req);
  }

  if (action === 'close') {
    const cycleId = form.get('cycleId');
    if (typeof cycleId !== 'string' || !closeCycle(db, cycleId)) {
      return redirectToDashboard(req, 'notfound');
    }
    return redirectToDashboard(req);
  }

  return redirectToDashboard(req, 'action');
}
