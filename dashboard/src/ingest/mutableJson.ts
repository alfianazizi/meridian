import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import type { DB } from '../db/connection.js';
import { allowedSourceFor, type SourceKind } from '../lib/allowlist.js';
import { redactSensitive } from '../lib/redact.js';

export interface MutableIngestResult {
  source: string;
  inserted: number;
  updated: number;
  skipped_unchanged: number;
  errors: number;
}

interface Options {
  file: string;
  kind: Exclude<SourceKind, 'actions_jsonl'>;
}

const now = () => new Date().toISOString();
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const asString = (value: unknown): string | null => typeof value === 'string' ? value : null;
const json = (value: unknown): string => JSON.stringify(redactSensitive(value));

export function ingestMutableJson(db: DB, options: Options): MutableIngestResult {
  const allowed = allowedSourceFor(options.file);
  if (!allowed || allowed.kind !== options.kind || allowed.jsonl) {
    throw new Error(`Path not allow listed for ${options.kind} ingestion: ${options.file}`);
  }

  const buffer = readFileSync(options.file);
  const sourceHash = digest(buffer);
  const source = basename(options.file);
  const previous = db.prepare(
    'SELECT current_hash FROM ingestion_sources WHERE kind = ? AND path = ?'
  ).get(options.kind, options.file) as { current_hash: string | null } | undefined;
  if (previous?.current_hash === sourceHash) {
    const count = sourceRowCount(db, options.kind, source);
    recordRun(db, source, options.kind, 0, 0, count, 0, true, buffer.length);
    return { source, inserted: 0, updated: 0, skipped_unchanged: count, errors: 0 };
  }

  let document: unknown;
  try {
    document = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    db.prepare(
      `INSERT INTO ingestion_errors(source, kind, body, error) VALUES (?, ?, ?, ?)`
    ).run(source, options.kind, '[REDACTED MALFORMED DOCUMENT]', error instanceof Error ? error.message : 'invalid json');
    recordRun(db, source, options.kind, 0, 0, 0, 1, false, buffer.length);
    return { source, inserted: 0, updated: 0, skipped_unchanged: 0, errors: 1 };
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const transaction = db.transaction(() => {
    const root = document as Record<string, unknown>;
    if (options.kind === 'state') {
      const positions = root.positions && typeof root.positions === 'object' && !Array.isArray(root.positions)
        ? root.positions as Record<string, unknown> : {};
      for (const [key, raw] of Object.entries(positions)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          errors += recordRowError(db, source, options.kind, raw, 'position row is not an object');
          continue;
        }
        const row = raw as Record<string, unknown>;
        const position = asString(row.position) ?? key;
        if (!position) {
          errors += recordRowError(db, source, options.kind, row, 'position address is missing');
          continue;
        }
        const existed = Boolean(db.prepare('SELECT 1 FROM positions WHERE position=?').get(position));
        const bin = row.bin_range && typeof row.bin_range === 'object' ? row.bin_range as Record<string, unknown> : {};
        const notes = Array.isArray(row.notes) ? row.notes.filter((item): item is string => typeof item === 'string') : [];
        const autoclose = notes.some((note) => note.includes('Auto-closed during state sync'));
        db.prepare(
          `INSERT INTO positions
           (position,pool,pool_name,strategy,amount_sol,initial_value_usd,bin_range_min,bin_range_max,
            bin_step,volatility,fee_tvl_ratio,organic_score,deployed_at,closed_at,closed,autoclose,
            signal_snapshot,raw_json,source_hash,source_file,last_seen_at,last_updated_at)
           VALUES (@position,@pool,@poolName,@strategy,@amount,@initial,@min,@max,@binStep,@volatility,
            @feeTvl,@organic,@deployed,@closedAt,@closed,@autoclose,@signal,@raw,@sourceHash,@source,@seen,@seen)
           ON CONFLICT(position) DO UPDATE SET
            pool=excluded.pool,pool_name=excluded.pool_name,strategy=excluded.strategy,
            amount_sol=excluded.amount_sol,initial_value_usd=excluded.initial_value_usd,
            bin_range_min=excluded.bin_range_min,bin_range_max=excluded.bin_range_max,
            bin_step=excluded.bin_step,volatility=excluded.volatility,fee_tvl_ratio=excluded.fee_tvl_ratio,
            organic_score=excluded.organic_score,deployed_at=excluded.deployed_at,closed_at=excluded.closed_at,
            closed=excluded.closed,autoclose=excluded.autoclose,signal_snapshot=excluded.signal_snapshot,
            raw_json=excluded.raw_json,source_hash=excluded.source_hash,last_seen_at=excluded.last_seen_at,
            last_updated_at=excluded.last_updated_at`
        ).run({
          position, pool: asString(row.pool), poolName: asString(row.pool_name), strategy: asString(row.strategy),
          amount: asNumber(row.amount_sol), initial: asNumber(row.initial_value_usd), min: asNumber(bin.min),
          max: asNumber(bin.max), binStep: asNumber(row.bin_step), volatility: asNumber(row.volatility),
          feeTvl: asNumber(row.fee_tvl_ratio), organic: asNumber(row.organic_score), deployed: asString(row.deployed_at),
          closedAt: asString(row.closed_at), closed: row.closed === true ? 1 : 0, autoclose: autoclose ? 1 : 0,
          signal: row.signal_snapshot == null ? null : json(row.signal_snapshot), raw: json(row), sourceHash,
          source, seen: now(),
        });
        existed ? updated += 1 : inserted += 1;
      }
    } else if (options.kind === 'lessons') {
      const performance = Array.isArray(root.performance) ? root.performance : [];
      for (const raw of performance) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          errors += recordRowError(db, source, options.kind, raw, 'performance row is not an object');
          continue;
        }
        const row = raw as Record<string, unknown>;
        const position = asString(row.position);
        const numericFields = ['pnl_usd', 'pnl_pct', 'fees_earned_usd', 'initial_value_usd', 'final_value_usd'];
        const invalidNumber = numericFields.some((field) => row[field] != null && asNumber(row[field]) == null);
        if (!position || invalidNumber) {
          errors += recordRowError(db, source, options.kind, row, !position ? 'position address is invalid' : 'numeric field is invalid');
          continue;
        }
        const existed = Boolean(db.prepare('SELECT 1 FROM performance_records WHERE position=?').get(position));
        db.prepare(
          `INSERT INTO performance_records
           (position,pool,pool_name,strategy,initial_value_usd,final_value_usd,fees_earned_usd,pnl_usd,
            pnl_pct,range_efficiency,minutes_held,minutes_in_range,close_reason,recorded_at,signal_snapshot,
            raw_json,source_hash,source_file,last_seen_at,last_updated_at)
           VALUES (@position,@pool,@poolName,@strategy,@initial,@final,@fees,@pnl,@pnlPct,@rangeEfficiency,
            @minutesHeld,@minutesInRange,@closeReason,@recordedAt,@signal,@raw,@sourceHash,@source,@seen,@seen)
           ON CONFLICT(position) DO UPDATE SET
            pool=excluded.pool,pool_name=excluded.pool_name,strategy=excluded.strategy,
            initial_value_usd=excluded.initial_value_usd,final_value_usd=excluded.final_value_usd,
            fees_earned_usd=excluded.fees_earned_usd,pnl_usd=excluded.pnl_usd,pnl_pct=excluded.pnl_pct,
            range_efficiency=excluded.range_efficiency,minutes_held=excluded.minutes_held,
            minutes_in_range=excluded.minutes_in_range,close_reason=excluded.close_reason,
            recorded_at=excluded.recorded_at,signal_snapshot=excluded.signal_snapshot,raw_json=excluded.raw_json,
            source_hash=excluded.source_hash,last_seen_at=excluded.last_seen_at,last_updated_at=excluded.last_updated_at`
        ).run({
          position, pool: asString(row.pool), poolName: asString(row.pool_name), strategy: asString(row.strategy),
          initial: asNumber(row.initial_value_usd), final: asNumber(row.final_value_usd), fees: asNumber(row.fees_earned_usd),
          pnl: asNumber(row.pnl_usd), pnlPct: asNumber(row.pnl_pct), rangeEfficiency: asNumber(row.range_efficiency),
          minutesHeld: asNumber(row.minutes_held), minutesInRange: asNumber(row.minutes_in_range),
          closeReason: asString(row.close_reason), recordedAt: asString(row.recorded_at),
          signal: row.signal_snapshot == null ? null : json(row.signal_snapshot), raw: json(row), sourceHash,
          source, seen: now(),
        });
        existed ? updated += 1 : inserted += 1;
      }
    } else {
      const decisions = Array.isArray(root.decisions) ? root.decisions : [];
      for (const raw of decisions) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          errors += recordRowError(db, source, options.kind, raw, 'decision row is not an object');
          continue;
        }
        const row = raw as Record<string, unknown>;
        const id = asString(row.id);
        if (!id) {
          errors += recordRowError(db, source, options.kind, row, 'decision id is invalid');
          continue;
        }
        const existed = Boolean(db.prepare('SELECT 1 FROM decisions WHERE id=?').get(id));
        db.prepare(
          `INSERT INTO decisions
           (id,ts,type,actor,pool,pool_name,position,summary,reason,risks_json,metrics_json,rejected_json,
            raw_json,source_hash,source_file,last_seen_at,last_updated_at)
           VALUES (@id,@ts,@type,@actor,@pool,@poolName,@position,@summary,@reason,@risks,@metrics,@rejected,
            @raw,@sourceHash,@source,@seen,@seen)
           ON CONFLICT(id) DO UPDATE SET
            ts=excluded.ts,type=excluded.type,actor=excluded.actor,pool=excluded.pool,pool_name=excluded.pool_name,
            position=excluded.position,summary=excluded.summary,reason=excluded.reason,risks_json=excluded.risks_json,
            metrics_json=excluded.metrics_json,rejected_json=excluded.rejected_json,raw_json=excluded.raw_json,
            source_hash=excluded.source_hash,last_seen_at=excluded.last_seen_at,last_updated_at=excluded.last_updated_at`
        ).run({
          id, ts: asString(row.ts), type: asString(row.type), actor: asString(row.actor), pool: asString(row.pool),
          poolName: asString(row.pool_name), position: asString(row.position), summary: asString(row.summary),
          reason: asString(row.reason), risks: json(row.risks ?? []), metrics: json(row.metrics ?? {}),
          rejected: json(row.rejected ?? []), raw: json(row), sourceHash, source, seen: now(),
        });
        existed ? updated += 1 : inserted += 1;
      }
    }

    const st = statSync(options.file);
    db.prepare(
      `INSERT INTO ingestion_sources(name,kind,path,current_hash,size,mtime_ms,last_seen_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(kind,path) DO UPDATE SET current_hash=excluded.current_hash,size=excluded.size,
        mtime_ms=excluded.mtime_ms,last_seen_at=excluded.last_seen_at,state='ok'`
    ).run(source, options.kind, options.file, sourceHash, st.size, st.mtimeMs, now());
    recordRun(db, source, options.kind, inserted, updated, 0, errors, true, buffer.length);
  });
  transaction();
  return { source, inserted, updated, skipped_unchanged: 0, errors };
}

function sourceRowCount(db: DB, kind: Options['kind'], source: string): number {
  const table = kind === 'state' ? 'positions' : kind === 'lessons' ? 'performance_records' : 'decisions';
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE source_file=?`).get(source) as { n: number }).n;
}

function recordRowError(db: DB, source: string, kind: string, raw: unknown, error: string): number {
  db.prepare(
    `INSERT INTO ingestion_errors(source,kind,raw_json,error) VALUES (?,?,?,?)`
  ).run(source, kind, json(raw), error);
  return 1;
}

function recordRun(
  db: DB, source: string, kind: string, inserted: number, updated: number,
  skipped: number, errors: number, ok: boolean, bytes: number
): void {
  db.prepare(
    `INSERT INTO ingestion_runs
     (source,kind,started_at,finished_at,ok,bytes_read,inserted,updated,skipped,unchanged,errors)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(source, kind, now(), now(), ok ? 1 : 0, bytes, inserted, updated, skipped, skipped > 0 ? 1 : 0, errors);
}
