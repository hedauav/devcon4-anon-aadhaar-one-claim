import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cycles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  opened_at  INTEGER NOT NULL,
  closed_at  INTEGER
);
-- At most one cycle can be open at a time.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_cycle ON cycles(status) WHERE status = 'open';

-- A draft is created by the server before proving; its signal is what the proof must commit to.
CREATE TABLE IF NOT EXISTS drafts (
  draft_id   TEXT PRIMARY KEY,
  cycle_id   TEXT NOT NULL REFERENCES cycles(id),
  signal     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  used_at    INTEGER
);

-- Applications hold only non-identifying intake answers. No Aadhaar data, no proof, no name.
CREATE TABLE IF NOT EXISTS applications (
  id               TEXT PRIMARY KEY,
  cycle_id         TEXT NOT NULL REFERENCES cycles(id),
  draft_id         TEXT NOT NULL UNIQUE REFERENCES drafts(draft_id),
  household_size   INTEGER NOT NULL,
  support_category TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at       INTEGER NOT NULL,
  reviewed_at      INTEGER
);

-- The slot ledger: who (as an app-scoped nullifier) has taken a slot in which cycle.
-- INVARIANT (one claim per human per cycle): UNIQUE(cycle_id, nullifier) is the database backstop
-- for the read-before-write check in lib/intake.ts.
CREATE TABLE IF NOT EXISTS claims (
  cycle_id       TEXT NOT NULL REFERENCES cycles(id),
  nullifier      TEXT NOT NULL,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  claimed_at     INTEGER NOT NULL,
  UNIQUE (cycle_id, nullifier)
);

-- Duplicates turned away. Deliberately stores no nullifier or identity, only that it happened.
CREATE TABLE IF NOT EXISTS duplicate_attempts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT NOT NULL REFERENCES cycles(id),
  at       INTEGER NOT NULL
);
`;

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

const globalForDb = globalThis as unknown as { __oneClaimDb?: DB };

/** Process-wide connection (survives Next.js dev hot reloads). */
export function getDb(): DB {
  if (!globalForDb.__oneClaimDb) {
    globalForDb.__oneClaimDb = openDatabase(process.env.DATABASE_PATH || './data/one-claim.db');
  }
  return globalForDb.__oneClaimDb;
}
