import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/schema.js';
import { ingestJsonlFile } from '../src/ingest/jsonl.js';
import { makeTempDir, write } from './helpers.js';

let dir: string;
let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  dir = makeTempDir('jsonl-');
  db = openDatabase(':memory:');
  migrate(db);
});

function actionFile(): string {
  return join(dir, 'logs', 'actions-2026-01-01.jsonl');
}

function writeActionLines(lines: string[]) {
  write(actionFile(), lines.join('\n') + (lines.length ? '\n' : ''));
}

describe('JSONL incremental ingestion', () => {
  it('ingests append-only lines with source generation + byte offset identity', () => {
    writeActionLines([
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 't1', success: true, duration_ms: 1 }),
      JSON.stringify({ timestamp: '2026-01-01T00:00:01Z', tool: 't2', success: false, duration_ms: 2 }),
    ]);
    const r1 = ingestJsonlFile(db, actionFile());
    expect(r1.inserted).toBe(2);
    const rows = db
      .prepare('SELECT * FROM action_events ORDER BY byte_offset')
      .all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].generation_id).toBe(0);
    expect(rows[0].byte_offset).toBe(0);
    expect(rows[1].byte_offset).toBeGreaterThan(rows[0].byte_offset);
    // identity = generation_id + byte_offset must be unique
    const uniq = new Set(rows.map((r) => `${r.generation_id}:${r.byte_offset}`));
    expect(uniq.size).toBe(2);
    // normalized fields
    expect(rows[0].tool).toBe('t1');
    expect(rows[0].success).toBe(1);
    expect(rows[0].duration_ms).toBe(1);
    expect(typeof rows[0].content_hash).toBe('string');
  });

  it('only ingests the appended tail on a second run (idempotent incremental)', () => {
    writeActionLines([
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 't1', success: true, duration_ms: 1 }),
    ]);
    ingestJsonlFile(db, actionFile());
    // append
    writeActionLines([
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 't1', success: true, duration_ms: 1 }),
      JSON.stringify({ timestamp: '2026-01-01T00:01:00Z', tool: 't2', success: true, duration_ms: 5 }),
    ]);
    const r2 = ingestJsonlFile(db, actionFile());
    expect(r2.inserted).toBe(1);
    expect(r2.skipped_unchanged).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM action_events').get()).toEqual({ n: 2 });
  });

  it('parses and ingests a trailing partial line when it later completes', () => {
    // partial line: incomplete JSON at the very end, no trailing newline
    write(
      actionFile(),
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 't1', success: true, duration_ms: 1 }) +
        '\n' +
        '{"timestamp":"2026-01-01T00:00:01Z","tool":"t2","succ'
    );
    const r1 = ingestJsonlFile(db, actionFile());
    expect(r1.inserted).toBe(1);
    expect(r1.partial).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM action_events').get()).toEqual({ n: 1 });

    // complete the partial line
    write(
      actionFile(),
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 't1', success: true, duration_ms: 1 }) +
        '\n' +
        '{"timestamp":"2026-01-01T00:00:01Z","tool":"t2","success":true,"duration_ms":2}\n'
    );
    const r2 = ingestJsonlFile(db, actionFile());
    expect(r2.inserted).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM action_events').get()).toEqual({ n: 2 });
  });

  it('starts a new generation when the file is truncated or rotated', () => {
    writeActionLines([
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 't1', success: true, duration_ms: 1 }),
    ]);
    ingestJsonlFile(db, actionFile());
    // truncate then rewrite completely
    write(
      actionFile(),
      JSON.stringify({ timestamp: '2026-01-01T02:00:00Z', tool: 't3', success: true, duration_ms: 3 }) + '\n'
    );
    const r = ingestJsonlFile(db, actionFile());
    expect(r.generation).toBe(1);
    // old row retained, new row added with new generation
    expect(db.prepare('SELECT COUNT(*) n FROM action_events').get()).toEqual({ n: 2 });
  });

  it('preserves retries: identical payloads are separate rows', () => {
    const line =
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 't', success: false, duration_ms: 9, args: { a: 1 } }) +
      '\n';
    write(actionFile(), line + line);
    const r = ingestJsonlFile(db, actionFile());
    expect(r.inserted).toBe(2);
    // both present, different byte offsets
    expect(db.prepare('SELECT COUNT(*) n FROM action_events').get()).toEqual({ n: 2 });
  });

  it('records a malformed line in ingestion_errors and continues', () => {
    write(
      actionFile(),
      '{"this":"is not valid json\n' +
        '\n' +
        JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 'ok', success: true, duration_ms: 1 }) +
        '\n'
    );
    const r = ingestJsonlFile(db, actionFile());
    expect(r.errors).toBe(1);
    expect(r.inserted).toBe(1);
    const err = db.prepare('SELECT * FROM ingestion_errors').get() as any;
    expect(err.source).toContain('actions-');
    expect(err.body).toBe('{"this":"is not valid json');
  });

  it('redacts sensitive keys in action raw_json', () => {
    write(
      actionFile(),
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', tool: 't', success: true, duration_ms: 1, args: { api_key: 'secret-token' } }) +
        '\n'
    );
    ingestJsonlFile(db, actionFile());
    const row = db.prepare('SELECT * FROM action_events').get() as any;
    expect(row.raw_json).not.toContain('secret-token');
    expect(row.raw_json).toContain('[REDACTED]');
    expect(row.raw_json).toContain('api_key');
  });
});
