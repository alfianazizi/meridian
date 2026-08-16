import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/schema.js';
import { reconcileQuality } from '../src/ingest/quality.js';

let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

function insertPosition(position: string, opts: { closed?: boolean; autoclose?: boolean } = {}) {
  db.prepare(
    `INSERT INTO positions (position, pool, closed, raw_json, source_hash, source_file, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, '{}', 'x', 'state.json', datetime('now'), datetime('now'))`
  ).run(position, 'POOL', opts.closed === false ? 0 : 1);
  if (opts.autoclose) {
    db.prepare(`UPDATE positions SET autoclose = 1 WHERE position = ?`).run(position);
  }
}

function insertPerformance(position: string, initial: number, pnl: number) {
  db.prepare(
    `INSERT INTO performance_records (position, pool, initial_value_usd, pnl_usd, raw_json, source_hash, source_file, first_seen_at, last_seen_at)
     VALUES (?, 'POOL', ?, ?, '{}', 'x', 'lessons.json', datetime('now'), datetime('now'))`
  ).run(position, initial, pnl);
}

function insertCloseAction(position: string) {
  db.prepare(
    `INSERT INTO action_events (generation_id, byte_offset, tool, timestamp, success, duration_ms, raw_json, content_hash, source_file, position)
     VALUES (0, ?, 'close_position', '2026-01-01T00:00:00Z', 1, 1, '{}', 'x', 'actions', ?)`
  ).run(actionOffset++, position);
}
let actionOffset = 0;

describe('quality reconciliation', () => {
  it('marks verified_modern for performance + state + close action', async () => {
    insertPosition('P1', { closed: true });
    insertPerformance('P1', 100, 5);
    insertCloseAction('P1');
    const n = await reconcileQuality(db);
    expect(n).toBeGreaterThan(0);
    const row = db.prepare('SELECT performance_quality FROM performance_records WHERE position=?').get('P1') as any;
    expect(row.performance_quality).toBe('verified_modern');
  });

  it('marks state_sync_unreconciled for auto-closed state without performance', async () => {
    insertPosition('P1', { closed: true, autoclose: true });
    await reconcileQuality(db);
    const row = db.prepare('SELECT closure_quality FROM positions WHERE position=?').get('P1') as any;
    expect(row.closure_quality).toBe('state_sync_unreconciled');
  });

  it('marks invalid_zero_cost_basis for non-positive initial value', async () => {
    insertPerformance('P1', 0, 0);
    await reconcileQuality(db);
    const row = db.prepare('SELECT performance_quality FROM performance_records WHERE position=?').get('P1') as any;
    expect(row.performance_quality).toBe('invalid_zero_cost_basis');
  });

  it('marks legacy_performance_only for performance without state or close action', async () => {
    insertPerformance('P1', 100, 3);
    await reconcileQuality(db);
    const row = db.prepare('SELECT performance_quality FROM performance_records WHERE position=?').get('P1') as any;
    expect(row.performance_quality).toBe('legacy_performance_only');
  });

  it('reconciles verified_close_no_performance onto the action event', async () => {
    insertPosition('P1', { closed: true });
    insertCloseAction('P1'); // no performance row (state metadata missing)
    await reconcileQuality(db);
    const row = db.prepare('SELECT quality FROM action_events WHERE tool=?').get('close_position') as any;
    expect(row).toBeTruthy();
    expect(row.quality).toBe('verified_close_no_performance');
  });
});
