import { randomBytes, randomUUID } from 'node:crypto';
import type { DB } from './db';
import { deriveSignal } from './signal';
import type { SupportCategory } from './categories';

export { SUPPORT_CATEGORIES, SUPPORT_LABELS, type SupportCategory } from './categories';

export type CycleStatus = 'open' | 'closed';
export type Cycle = {
  id: string;
  name: string;
  status: CycleStatus;
  openedAt: number;
  closedAt: number | null;
};

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export type Application = {
  id: string;
  cycleId: string;
  householdSize: number;
  supportCategory: SupportCategory;
  status: ApplicationStatus;
  createdAt: number;
  reviewedAt: number | null;
};

export type Draft = {
  draftId: string;
  cycleId: string;
  signal: string;
  createdAt: number;
  usedAt: number | null;
};

export type CycleStats = {
  /** Applications whose proof verified and took a slot. */
  verified: number;
  /** Second attempts by a human who already holds a slot this cycle. */
  duplicatesTurnedAway: number;
  pending: number;
  approved: number;
  rejected: number;
};

/** Applicants have this long between starting a draft and submitting its proof. */
export const DRAFT_TTL_MS = 60 * 60 * 1000;

export class CycleError extends Error {}

type CycleRow = {
  id: string;
  name: string;
  status: CycleStatus;
  opened_at: number;
  closed_at: number | null;
};
type DraftRow = {
  draft_id: string;
  cycle_id: string;
  signal: string;
  created_at: number;
  used_at: number | null;
};
type ApplicationRow = {
  id: string;
  cycle_id: string;
  household_size: number;
  support_category: SupportCategory;
  status: ApplicationStatus;
  created_at: number;
  reviewed_at: number | null;
};

const toCycle = (r: CycleRow): Cycle => ({
  id: r.id,
  name: r.name,
  status: r.status,
  openedAt: r.opened_at,
  closedAt: r.closed_at,
});
const toDraft = (r: DraftRow): Draft => ({
  draftId: r.draft_id,
  cycleId: r.cycle_id,
  signal: r.signal,
  createdAt: r.created_at,
  usedAt: r.used_at,
});
const toApplication = (r: ApplicationRow): Application => ({
  id: r.id,
  cycleId: r.cycle_id,
  householdSize: r.household_size,
  supportCategory: r.support_category,
  status: r.status,
  createdAt: r.created_at,
  reviewedAt: r.reviewed_at,
});

// ---------- cycles ----------

export function getOpenCycle(db: DB): Cycle | null {
  const row = db.prepare(`SELECT * FROM cycles WHERE status = 'open'`).get() as
    CycleRow | undefined;
  return row ? toCycle(row) : null;
}

export function getCycle(db: DB, id: string): Cycle | null {
  const row = db.prepare(`SELECT * FROM cycles WHERE id = ?`).get(id) as CycleRow | undefined;
  return row ? toCycle(row) : null;
}

export function listCycles(db: DB): Cycle[] {
  const rows = db.prepare(`SELECT * FROM cycles ORDER BY opened_at DESC`).all() as CycleRow[];
  return rows.map(toCycle);
}

export function openCycle(db: DB, name: string, now = Date.now()): Cycle {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new CycleError('Cycle name must be 1-80 characters');
  if (getOpenCycle(db)) throw new CycleError('Close the current cycle before opening a new one');
  const cycle: Cycle = {
    id: randomUUID(),
    name: trimmed,
    status: 'open',
    openedAt: now,
    closedAt: null,
  };
  db.prepare(`INSERT INTO cycles (id, name, status, opened_at) VALUES (?, ?, 'open', ?)`).run(
    cycle.id,
    cycle.name,
    cycle.openedAt,
  );
  return cycle;
}

export function closeCycle(db: DB, id: string, now = Date.now()): boolean {
  const res = db
    .prepare(`UPDATE cycles SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'`)
    .run(now, id);
  return res.changes === 1;
}

// ---------- drafts ----------

/** Server-issued draft: random id + the signal the applicant's proof must commit to. */
export function createDraft(db: DB, cycleId: string, now = Date.now()): Draft {
  const draftId = randomUUID();
  const draft: Draft = {
    draftId,
    cycleId,
    signal: deriveSignal(cycleId, draftId),
    createdAt: now,
    usedAt: null,
  };
  db.prepare(`INSERT INTO drafts (draft_id, cycle_id, signal, created_at) VALUES (?, ?, ?, ?)`).run(
    draft.draftId,
    draft.cycleId,
    draft.signal,
    draft.createdAt,
  );
  return draft;
}

export function getDraft(db: DB, draftId: string): Draft | null {
  const row = db.prepare(`SELECT * FROM drafts WHERE draft_id = ?`).get(draftId) as
    DraftRow | undefined;
  return row ? toDraft(row) : null;
}

// ---------- applications ----------

/** Human-friendly reference the applicant keeps (random; says nothing about them). */
export function newApplicationId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `OC-${out.slice(0, 5)}-${out.slice(5)}`;
}

export function listApplications(db: DB, cycleId: string): Application[] {
  const rows = db
    .prepare(`SELECT * FROM applications WHERE cycle_id = ? ORDER BY created_at ASC`)
    .all(cycleId) as ApplicationRow[];
  return rows.map(toApplication);
}

export function reviewApplication(
  db: DB,
  id: string,
  decision: Exclude<ApplicationStatus, 'pending'>,
  now = Date.now(),
): boolean {
  const res = db
    .prepare(`UPDATE applications SET status = ?, reviewed_at = ? WHERE id = ?`)
    .run(decision, now, id);
  return res.changes === 1;
}

export function getStats(db: DB, cycleId: string): CycleStats {
  const counts = db
    .prepare(
      `SELECT
         COUNT(*)                                            AS verified,
         COALESCE(SUM(CASE WHEN status = 'pending'  THEN 1 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 END), 0) AS approved,
         COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 END), 0) AS rejected
       FROM applications WHERE cycle_id = ?`,
    )
    .get(cycleId) as Omit<CycleStats, 'duplicatesTurnedAway'>;
  const dup = db
    .prepare(`SELECT COUNT(*) AS n FROM duplicate_attempts WHERE cycle_id = ?`)
    .get(cycleId) as { n: number };
  return { ...counts, duplicatesTurnedAway: dup.n };
}
