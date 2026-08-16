import type { DB } from './connection.js';

/**
 * The current analytics normalization version. Bump whenever any table shape
 * or normalization semantics change; add a corresponding migration below and
 * extend migration/fixture coverage (see analytics source contract section 14).
 */
export const SCHEMA_VERSION = 1;

interface Migration {
  version: number;
  name: string;
  sql: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial ingestion schema',
    sql: [
      // ---- provenance / opaque instrumentation ----
      `CREATE TABLE ingestion_sources (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL UNIQUE,          -- canonical allow listed name/label
        kind          TEXT NOT NULL,                  -- 'state' | 'lessons' | 'decisions' | 'actions_jsonl'
        path          TEXT NOT NULL,
        state         TEXT NOT NULL DEFAULT 'ok',     -- ok | malformed | warning
        current_hash  TEXT,                           -- sha256 last seen (mutable json)
        generation_id INTEGER NOT NULL DEFAULT 0,     -- jsonl generation counter
        cursor_offset INTEGER NOT NULL DEFAULT 0,     -- jsonl byte offset (start of next read)
        partial_line  TEXT,                           -- trailing partial jsonl line carried over
        device        INTEGER,
        inode         INTEGER,
        size          INTEGER,
        mtime_ms      INTEGER,
        last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE (kind, path)
      )`,

      `CREATE TABLE ingestion_runs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        source          TEXT NOT NULL,
        kind            TEXT NOT NULL,
        started_at      TEXT NOT NULL,
        finished_at     TEXT,
        ok              INTEGER NOT NULL DEFAULT 0,
        bytes_read      INTEGER NOT NULL DEFAULT 0,
        inserted        INTEGER NOT NULL DEFAULT 0,
        updated         INTEGER NOT NULL DEFAULT 0,
        skipped         INTEGER NOT NULL DEFAULT 0,
        unchanged       INTEGER NOT NULL DEFAULT 0,
        errors          INTEGER NOT NULL DEFAULT 0,
        partial         INTEGER NOT NULL DEFAULT 0,
        generation_id   INTEGER NOT NULL DEFAULT 0,
        offset          INTEGER NOT NULL DEFAULT 0,
        error_message   TEXT
      )`,
      `CREATE INDEX idx_ingestion_runs_source_start ON ingestion_runs(source, started_at)`,

      `CREATE TABLE ingestion_errors (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        source      TEXT NOT NULL,
        kind        TEXT NOT NULL,
        occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        body        TEXT,              -- redacted original line/payload (jsonl) or raw text
        raw_json    TEXT,              -- redacted JSON payload when recoverable (mutable)
        error       TEXT NOT NULL,
        generation_id INTEGER,         -- jsonl generation when applicable
        byte_offset   INTEGER,         -- jsonl byte offset when applicable
        retried     INTEGER NOT NULL DEFAULT 0,
        resolved    INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX idx_ingestion_errors_source ON ingestion_errors(source, occurred_at)`,

      // ---- positions ----
      `CREATE TABLE positions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        position       TEXT NOT NULL UNIQUE,          -- canonical Solana position address
        pool           TEXT,                          -- canonical pool address
        pool_name      TEXT,
        strategy       TEXT,
        amount_sol     REAL,
        initial_value_usd REAL,
        bin_range_min  INTEGER,
        bin_range_max  INTEGER,
        bin_step       INTEGER,
        volatility     REAL,
        fee_tvl_ratio  REAL,
        organic_score  REAL,
        deployed_at    TEXT,
        closed_at      TEXT,
        closed         INTEGER NOT NULL DEFAULT 0,
        autoclose      INTEGER NOT NULL DEFAULT 0,    -- state-sync auto-close
        signal_snapshot TEXT,                         -- redacted JSON snapshot
        closure_quality  TEXT,                        -- state_sync_unreconciled | verified | ...
        raw_json       TEXT NOT NULL,                 -- redacted original payload
        source_hash    TEXT NOT NULL,                 -- sha256 of the *source file* that produced this row
        source_file    TEXT NOT NULL,
        first_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_seen_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX idx_positions_pool ON positions(pool)`,
      `CREATE INDEX idx_positions_closed ON positions(closed, closed_at)`,
      `CREATE INDEX idx_positions_last_seen ON positions(last_seen_at)`,

      // ---- performance ----
      `CREATE TABLE performance_records (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        position          TEXT NOT NULL UNIQUE,       -- canonical join key by position address
        pool              TEXT,
        pool_name         TEXT,
        strategy          TEXT,
        initial_value_usd REAL,
        final_value_usd   REAL,
        fees_earned_usd   REAL,
        pnl_usd           REAL,
        pnl_pct           REAL,
        range_efficiency  REAL,
        minutes_held      INTEGER,
        minutes_in_range  INTEGER,
        close_reason      TEXT,
        recorded_at       TEXT,
        signal_snapshot   TEXT,                       -- redacted JSON
        performance_quality TEXT,                     -- verified_modern | legacy_performance_only | invalid_zero_cost_basis | ...
        raw_json          TEXT NOT NULL,              -- redacted original payload
        source_hash       TEXT NOT NULL,
        source_file       TEXT NOT NULL,
        first_seen_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_seen_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX idx_perf_pool ON performance_records(pool)`,
      `CREATE INDEX idx_perf_recorded ON performance_records(recorded_at)`,
      `CREATE INDEX idx_perf_quality ON performance_records(performance_quality)`,

      // ---- decisions ----
      `CREATE TABLE decisions (
        id             TEXT PRIMARY KEY,               -- natural key decision ID
        ts             TEXT,
        type           TEXT,
        actor          TEXT,
        pool           TEXT,
        pool_name      TEXT,
        position       TEXT,
        summary        TEXT,
        reason         TEXT,
        risks_json     TEXT,
        metrics_json   TEXT,
        rejected_json  TEXT,
        raw_json       TEXT NOT NULL,                  -- redacted original payload
        source_hash    TEXT NOT NULL,
        source_file    TEXT NOT NULL,
        first_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_seen_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX idx_decisions_ts ON decisions(ts)`,
      `CREATE INDEX idx_decisions_type ON decisions(type)`,

      // ---- action events ----
      `CREATE TABLE action_events (
        generation_id INTEGER NOT NULL,               -- source generation id
        byte_offset   INTEGER NOT NULL,               -- byte offset of the line in source
        source_file   TEXT NOT NULL,
        timestamp     TEXT,
        tool          TEXT,
        args_json     TEXT,
        result_json   TEXT,
        error         TEXT,
        duration_ms   INTEGER,
        success       INTEGER,
        raw_json      TEXT NOT NULL,                  -- redacted original line
        content_hash  TEXT NOT NULL,                  -- sha256 of the raw (unredacted) line for dup diagnostics
        position      TEXT,                           -- extracted position address when present (close/deploy)
        quality       TEXT,                           -- e.g. verified_close_no_performance
        first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        PRIMARY KEY (generation_id, byte_offset, source_file)
      )`,
      `CREATE INDEX idx_actions_tool ON action_events(tool, timestamp)`,
      `CREATE INDEX idx_actions_timestamp ON action_events(timestamp)`,
      `CREATE INDEX idx_actions_position ON action_events(position)`,
      `CREATE INDEX idx_actions_position_hint ON action_events(tool, success)`,
    ],
  },
];

/** Apply all pending migrations inside independent transactions. */
export function migrate(db: DB): DB {
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM _migrations').all() as { version: number }[]).map(
      (r) => r.version
    )
  );

  const insertMigration = db.prepare(
    'INSERT INTO _migrations (version, name) VALUES (?, ?)'
  );

  // Run within a transaction so a failed migration rolls back cleanly.
  const tx = db.transaction((m: Migration) => {
    for (const stmt of m.sql) db.exec(stmt);
    insertMigration.run(m.version, m.name);
  });

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    tx(m);
  }
  return db;
}

export function currentSchemaVersion(db: DB): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM _migrations').get() as
    | { v: number }
    | undefined;
  return row?.v ?? 0;
}
