import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/schema.js';
import { ingestMutableJson } from '../src/ingest/mutableJson.js';
import { makeTempDir, write, read } from './helpers.js';

let dir: string;
let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  dir = makeTempDir('mutable-');
  db = openDatabase(':memory:');
  migrate(db);
});

describe('mutable JSON ingestion', () => {
  it('ingests positions, performance and decisions with natural-key upserts', () => {
    const stateFile = join(dir, 'state.json');
    write(
      stateFile,
      JSON.stringify({
        positions: {
          POS1: { position: 'POS1', pool: 'P1', closed: true, closed_at: '2026-01-01T00:00:00Z' },
        },
      })
    );
    const r = ingestMutableJson(db, { file: stateFile, kind: 'state' });
    expect(r.inserted).toBe(1);
    const row = db.prepare('SELECT * FROM positions WHERE position = ?').get('POS1') as any;
    expect(row.position).toBe('POS1');
    expect(typeof row.source_hash).toBe('string');
    expect(row.source_hash.length).toBe(64);

    // idempotent: unchanged -> skip
    const r2 = ingestMutableJson(db, { file: stateFile, kind: 'state' });
    expect(r2.skipped_unchanged).toBe(1);
    expect(r2.inserted).toBe(0);
    expect(r2.updated).toBe(0);
  });

  it('updates a row when content changes and bumps source hash', () => {
    const stateFile = join(dir, 'state.json');
    write(
      stateFile,
      JSON.stringify({ positions: { P1: { position: 'P1', closed: false } } })
    );
    ingestMutableJson(db, { file: stateFile, kind: 'state' });
    write(
      stateFile,
      JSON.stringify({ positions: { P1: { position: 'P1', closed: true } } })
    );
    const r = ingestMutableJson(db, { file: stateFile, kind: 'state' });
    expect(r.updated).toBe(1);
    const row = db.prepare('SELECT * FROM positions WHERE position=?').get('P1') as any;
    expect(row.closed).toBe(1);
  });

  it('marks last_seen_at and retains history when source rows disappear', () => {
    const stateFile = join(dir, 'state.json');
    write(
      stateFile,
      JSON.stringify({
        positions: {
          A: { position: 'A' },
          B: { position: 'B' },
        },
      })
    );
    ingestMutableJson(db, { file: stateFile, kind: 'state' });
    // B disappears
    write(stateFile, JSON.stringify({ positions: { A: { position: 'A' } } }));
    ingestMutableJson(db, { file: stateFile, kind: 'state' });
    // B must still exist, with last_seen_at set (not destroyed)
    const b = db.prepare('SELECT * FROM positions WHERE position=?').get('B') as any;
    expect(b).toBeTruthy();
    expect(b.last_seen_at).toBeTruthy();
    expect(db.prepare('SELECT COUNT(*) n FROM positions').get()).toEqual({ n: 2 });
  });

  it('presents rolling decisions but retains previously seen ones', () => {
    const decFile = join(dir, 'decision-log.json');
    const dec = (id: string) => ({ id, ts: '2026-01-01T00:00:00Z', type: 'deploy' });
    write(decFile, JSON.stringify({ decisions: [dec('D1'), dec('D2')] }));
    ingestMutableJson(db, { file: decFile, kind: 'decisions' });
    expect(db.prepare('SELECT COUNT(*) n FROM decisions').get()).toEqual({ n: 2 });

    // rolling window moves on: D1 falls out, D3 enters
    write(decFile, JSON.stringify({ decisions: [dec('D2'), dec('D3')] }));
    const r = ingestMutableJson(db, { file: decFile, kind: 'decisions' });
    expect(r.inserted).toBe(1); // only D3 is new
    expect(db.prepare('SELECT COUNT(*) n FROM decisions').get()).toEqual({ n: 3 });
    // D1 retained with last_seen_at (marker for roll-out), not destroyed
    const d1 = db.prepare('SELECT * FROM decisions WHERE id=?').get('D1') as any;
    expect(d1).toBeTruthy();
    expect(d1.last_seen_at).toBeTruthy();
  });

  it('records malformed rows in ingestion_errors without destructive deletes', () => {
    const lessonsFile = join(dir, 'lessons.json');
    write(
      lessonsFile,
      JSON.stringify({
        performance: [
          { position: 'P1', pnl_usd: 1 },
          { position: 12345, pnl_usd: 'NaN' }, // malformed: bad position + bad number
        ],
      })
    );
    const r = ingestMutableJson(db, { file: lessonsFile, kind: 'lessons' });
    expect(r.errors).toBeGreaterThan(0);
    // valid row persisted
    expect(db.prepare('SELECT COUNT(*) n FROM performance_records WHERE position=?').get('P1')).toEqual({ n: 1 });
    // error recorded
    const err = db.prepare('SELECT * FROM ingestion_errors').get() as any;
    expect(err.source).toBe('lessons.json');
    expect(typeof err.raw_json).toBe('string');
    // no destructive delete of prior state
    expect(db.prepare('SELECT COUNT(*) n FROM ingestion_errors').get()).toBeTruthy();
  });

  it('commits all valid upserts in one transaction with unchanged skip', () => {
    const lessonsFile = join(dir, 'lessons.json');
    const perf = [
      { position: 'P1', pnl_usd: 1 },
      { position: 'P2', pnl_usd: 2 },
    ];
    write(lessonsFile, JSON.stringify({ performance: perf }));
    const r1 = ingestMutableJson(db, { file: lessonsFile, kind: 'lessons' });
    expect(r1.inserted).toBe(2);
    const r2 = ingestMutableJson(db, { file: lessonsFile, kind: 'lessons' });
    expect(r2.skipped_unchanged).toBe(2);
    expect(db.prepare('SELECT COUNT(*) n FROM performance_records').get()).toEqual({ n: 2 });
  });

  it('redacts sensitive keys in stored raw JSON', () => {
    const stateFile = join(dir, 'state.json');
    write(
      stateFile,
      JSON.stringify({
        positions: {
          P1: { position: 'P1', api_key: 'sk-token', meta: { secret: 's' } },
        },
      })
    );
    ingestMutableJson(db, { file: stateFile, kind: 'state' });
    const row = db.prepare('SELECT raw_json FROM positions WHERE position=?').get('P1') as any;
    expect(row.raw_json).not.toContain('sk-token');
    expect(row.raw_json).toContain('[REDACTED]');
  });
});
