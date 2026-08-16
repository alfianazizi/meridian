import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { migrate } from './schema.js';

export type DB = DatabaseType;

/** Default runtime busy timeout in ms. */
export const DEFAULT_BUSY_TIMEOUT_MS = 5000;

/**
 * Open (and create if needed) a SQLite database using the patched
 * better-sqlite3 binding. WAL is only meaningful for file-backed handles;
 * :memory: databases ignore the pragma. Foreign keys and a busy timeout are
 * always applied so concurrent readers/writers serialize safely.
 */
export function openDatabase(
  filename: string,
  opts: { busyTimeoutMs?: number } = {}
): DB {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${opts.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS}`);
  if (filename !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  migrate(db);
  return db;
}

/** Close the database handle, guarding against double-close. */
export function closeDatabase(db: DB): void {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}
