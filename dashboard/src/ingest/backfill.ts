import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DB } from '../db/connection.js';
import { ingestJsonlFile } from './jsonl.js';
import { ingestMutableJson } from './mutableJson.js';
import { ingestModelTelemetry } from './modelTelemetry.js';
import { reconcileQuality } from './quality.js';

export interface BackfillSummary {
  positions: number;
  performance_records: number;
  decisions: number;
  action_events: number;
  ingestion_errors: number;
  verified_modern: number;
  legacy_performance_only: number;
  invalid_zero_cost_basis: number;
  state_sync_unreconciled: number;
  verified_close_no_performance: number;
}

export function backfill(db: DB, repositoryRoot: string): BackfillSummary {
  const root = resolve(repositoryRoot);
  ingestMutableJson(db, { file: join(root, 'state.json'), kind: 'state' });
  ingestMutableJson(db, { file: join(root, 'lessons.json'), kind: 'lessons' });
  ingestMutableJson(db, { file: join(root, 'decision-log.json'), kind: 'decisions' });

  const logs = join(root, 'logs');
  for (const name of readdirSync(logs).filter((name) => /^actions-[^/]+\.jsonl$/.test(name)).sort()) {
    ingestJsonlFile(db, join(logs, name));
  }
  const modelTelemetry=join(logs,'model-screening.jsonl');
  if(existsSync(modelTelemetry))ingestModelTelemetry(db,modelTelemetry);
  reconcileQuality(db);
  return summarize(db);
}

export function summarize(db: DB): BackfillSummary {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const quality = (table: 'positions' | 'performance_records' | 'action_events', column: string, value: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`).get(value) as { n: number }).n;
  return {
    positions: count('positions'),
    performance_records: count('performance_records'),
    decisions: count('decisions'),
    action_events: count('action_events'),
    ingestion_errors: count('ingestion_errors'),
    verified_modern: quality('performance_records', 'performance_quality', 'verified_modern'),
    legacy_performance_only: quality('performance_records', 'performance_quality', 'legacy_performance_only'),
    invalid_zero_cost_basis: quality('performance_records', 'performance_quality', 'invalid_zero_cost_basis'),
    state_sync_unreconciled: quality('positions', 'closure_quality', 'state_sync_unreconciled'),
    verified_close_no_performance: quality('action_events', 'quality', 'verified_close_no_performance'),
  };
}
