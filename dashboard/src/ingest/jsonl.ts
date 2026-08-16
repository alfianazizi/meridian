import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { DB } from '../db/connection.js';
import { allowedSourceFor } from '../lib/allowlist.js';
import { redactJson, redactSensitive } from '../lib/redact.js';

export interface JsonlIngestResult {
  source: string;
  generation: number;
  offset: number;
  bytes_read: number;
  inserted: number;
  skipped_unchanged: number;
  errors: number;
  partial: number;
  generation_reset: boolean;
}

interface SourceRow {
  generation_id: number;
  cursor_offset: number;
  device: number | null;
  inode: number | null;
  size: number | null;
  current_hash: string | null;
}

const now = () => new Date().toISOString();
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

export function extractPosition(payload: Record<string, unknown>): string | null {
  const args = payload.args as Record<string, unknown> | undefined;
  const result = payload.result as Record<string, unknown> | undefined;
  const value = args?.position_address ?? result?.position ?? payload.position;
  return typeof value === 'string' && value.length > 0 && value.length < 200 ? value : null;
}

export function ingestJsonlFile(db: DB, filePath: string): JsonlIngestResult {
  const allowed = allowedSourceFor(filePath);
  if (!allowed || allowed.kind !== 'actions_jsonl') throw new Error(`Path not allow listed for ingestion: ${filePath}`);

  const st = statSync(filePath);
  const file = basename(filePath);
  const buffer = readFileSync(filePath);
  const previous = db.prepare(
    `SELECT generation_id, cursor_offset, device, inode, size, current_hash
     FROM ingestion_sources WHERE kind = 'actions_jsonl' AND path = ?`
  ).get(filePath) as SourceRow | undefined;

  let generation = previous?.generation_id ?? 0;
  let cursor = previous?.cursor_offset ?? 0;
  let generationReset = false;
  if (previous) {
    const prefixLength = Math.min(cursor, buffer.length);
    const prefixChanged = previous.current_hash !== null && hash(buffer.subarray(0, prefixLength)) !== previous.current_hash;
    if (previous.device !== st.dev || previous.inode !== st.ino || buffer.length < cursor || prefixChanged) {
      generation += 1;
      cursor = 0;
      generationReset = true;
    }
  }

  const tail = buffer.subarray(cursor);
  const lastNewline = tail.lastIndexOf(10);
  const completeLength = lastNewline < 0 ? 0 : lastNewline + 1;
  const complete = tail.subarray(0, completeLength).toString('utf8');
  const partialText = tail.subarray(completeLength).toString('utf8');
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  const transaction = db.transaction(() => {
    const insertAction = db.prepare(
      `INSERT OR IGNORE INTO action_events
       (generation_id, byte_offset, source_file, timestamp, tool, args_json, result_json,
        error, duration_ms, success, raw_json, content_hash, position, quality)
       VALUES (@generation, @offset, @file, @timestamp, @tool, @args, @result,
        @error, @duration, @success, @raw, @contentHash, @position, NULL)`
    );
    const insertError = db.prepare(
      `INSERT INTO ingestion_errors
       (source, kind, body, error, generation_id, byte_offset)
       VALUES (?, 'actions_jsonl', ?, ?, ?, ?)`
    );

    let relativeOffset = 0;
    for (const lineWithNewline of complete.match(/.*\n/g) ?? []) {
      const line = lineWithNewline.slice(0, -1).replace(/\r$/, '');
      const byteOffset = cursor + relativeOffset;
      relativeOffset += Buffer.byteLength(lineWithNewline);
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('json is not an object');
        const payload = parsed as Record<string, unknown>;
        const info = insertAction.run({
          generation,
          offset: byteOffset,
          file,
          timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : null,
          tool: typeof payload.tool === 'string' ? payload.tool : null,
          args: payload.args && typeof payload.args === 'object' ? JSON.stringify(redactSensitive(payload.args)) : null,
          result: payload.result && typeof payload.result === 'object' ? JSON.stringify(redactSensitive(payload.result)) : null,
          error: typeof payload.error === 'string' ? payload.error : null,
          duration: typeof payload.duration_ms === 'number' && Number.isFinite(payload.duration_ms) ? Math.floor(payload.duration_ms) : null,
          success: typeof payload.success === 'boolean' ? Number(payload.success) : null,
          raw: redactJson(line),
          contentHash: hash(line),
          position: extractPosition(payload),
        });
        if (info.changes) inserted += 1;
        else skipped += 1;
      } catch (error) {
        errors += 1;
        insertError.run(file, redactJson(line), error instanceof Error ? error.message : 'invalid json', generation, byteOffset);
      }
    }

    const nextCursor = cursor + completeLength;
    const consumedHash = hash(buffer.subarray(0, nextCursor));
    db.prepare(
      `INSERT INTO ingestion_sources
       (name, kind, path, current_hash, generation_id, cursor_offset, partial_line, device, inode, size, mtime_ms, last_seen_at)
       VALUES (?, 'actions_jsonl', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, path) DO UPDATE SET
        current_hash=excluded.current_hash, generation_id=excluded.generation_id,
        cursor_offset=excluded.cursor_offset, partial_line=excluded.partial_line,
        device=excluded.device, inode=excluded.inode, size=excluded.size,
        mtime_ms=excluded.mtime_ms, last_seen_at=excluded.last_seen_at`
    ).run(file, filePath, consumedHash, generation, nextCursor, partialText || null, st.dev, st.ino, st.size, st.mtimeMs, now());

    db.prepare(
      `INSERT INTO ingestion_runs
       (source, kind, started_at, finished_at, ok, bytes_read, inserted, skipped, errors, partial, generation_id, offset)
       VALUES (?, 'actions_jsonl', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(file, now(), now(), tail.length, inserted, skipped, errors, partialText ? 1 : 0, generation, nextCursor);
  });
  transaction();

  return {
    source: file,
    generation,
    offset: cursor + completeLength,
    bytes_read: tail.length,
    inserted,
    skipped_unchanged: skipped,
    errors,
    partial: partialText ? 1 : 0,
    generation_reset: generationReset,
  };
}