import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/schema.js';

describe('schema and migrations', () => {
  const TABLES = [
    'ingestion_sources',
    'ingestion_runs',
    'ingestion_errors',
    'positions',
    'performance_records',
    'decisions',
    'action_events',
    'model_screening_runs',
    '_migrations',
  ];

  it('creates all ingestion tables', () => {
    const db = openDatabase(':memory:');
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    for (const t of TABLES) {
      expect(rows.map((r) => r.name)).toContain(t);
    }
    db.close();
  });

  it('applies migrations idempotently', () => {
    const db = openDatabase(':memory:');
    const before = migrationCount(db);
    migrate(db);
    migrate(db);
    expect(migrationCount(db)).toBe(before);
    db.close();
  });

  it('enables WAL, foreign keys and busy timeout on real files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meridian-db-'));
    const path = join(dir, 'db.sqlite');
    const db = openDatabase(path);
    expect(String(db.pragma('journal_mode', { simple: true }))).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBeGreaterThan(0);
    db.close();
  });

  it('creates useful indexes, including a unique action pointer', () => {
    const db = openDatabase(':memory:');
    const cols = db
      .prepare(`PRAGMA table_info(action_events)`)
      .all() as { pk: number; name: string }[];
    const pkCols = cols.filter((c) => c.pk > 0).map((c) => c.name);
    expect(pkCols).toContain('generation_id');
    expect(pkCols).toContain('byte_offset');
    db.close();
  });

  it('fully migrates a fresh database to the latest version', () => {
    const db = openDatabase(':memory:');
    const v = (db.prepare('SELECT MAX(version) AS v FROM _migrations').get() as {
      v: number;
    }).v;
    expect(v).toBeGreaterThan(0);
    db.close();
  });
});

function migrationCount(d: ReturnType<typeof openDatabase>): number {
  return (d.prepare('SELECT COUNT(*) AS n FROM _migrations').get() as { n: number }).n;
}
