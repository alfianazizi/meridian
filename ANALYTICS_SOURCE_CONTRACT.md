# Meridian Analytics Source Contract

Status: verified pre-implementation audit

Audit date: 2026-08-16 UTC

This document freezes what the analytics dashboard may and may not infer from Meridian's existing files. It is based on read-only inspection of runtime code and current persisted data. No trading process, state file, config, or log was modified.

## 1. Current source inventory

| Source | Current verified contents | Authority |
|---|---:|---|
| `state.json` | 466 tracked positions; all currently closed | Position lifecycle metadata and deployment-time configuration |
| `lessons.json.performance` | 460 unique closed-position performance records | Canonical realized closed-trade analytics |
| `lessons.json.lessons` | 104 generated/manual lessons | Learning artifacts, not the trade ledger |
| `decision-log.json.decisions` | Rolling latest 100 decisions | Recent structured decision timeline only |
| `logs/actions-*.jsonl` | 72 files, 3,519 actions, no malformed lines | Tool execution audit and reliability metrics |
| `signal-weights.json` | Current weights plus recalculation history | Adaptive-weight history, not raw candidate history |
| `logs/snapshots-*.jsonl` | None | Historical account equity unavailable |

Earlier counts of 464 positions, 90 performance records, and 3,498 actions were stale or referred to the wrong array. In particular, 90 was the count of generated lesson objects carrying performance-derived fields, not the canonical `performance` array.

## 2. Canonical identities and joins

### Position identity

The canonical position key is the Solana position address.

It appears as:

- the map key in `state.json.positions`;
- `state.json.positions[key].position`;
- `lessons.json.performance[].position`;
- deploy action `result.position`;
- close action `args.position_address` and successful `result.position`;
- structured decision `position` for deploy and close decisions.

Verified current data:

- All 466 state map keys equal their row's `position` field.
- All 460 performance rows have unique position addresses.
- All 466 successful deploy actions have unique position addresses and join to state.
- 453 performance rows join to both state and a successful close action.
- Seven early performance rows predate the current state/action history and do not join to state or successful action logs.
- Thirteen state rows were auto-closed during state sync and have no performance record.
- One successful close action has no performance row because the position was not tracked in local state.

### Pool identity

Use pool address as the canonical pool key:

- state/performance `pool`;
- action deploy `args.pool_address` and `result.pool`;
- successful close `result.pool`;
- decision `pool`.

`pool_name` is a display label only and must not be used as a join key.

### Event identity

Current action JSONL has no event ID. Use source provenance as the immutable ingestion key:

`source_generation_id + byte_offset`

Also store a content SHA-256 for duplicate diagnostics. Do not deduplicate separate retries merely because their payloads match.

Current decision IDs are unique (`dec_<epoch>_<random>`), but the file only retains 100 rows. Preserve previously ingested decisions when they roll out.

## 3. Position lifecycle contract

### Deployment

A successful `deploy_position` action is confirmed by a successful tool result with `result.position`. The deployment implementation tracks state before returning and appends a structured deploy decision after successful transaction handling.

Canonical deployment time:

1. `state.positions[position].deployed_at` for position lifecycle analytics.
2. Action `timestamp` for tool latency/audit analytics.

They differ by 0–36 ms in current data.

### Close finality

A successful close action is stronger than transaction submission alone. Both relay and local close paths:

1. submit confirmed Solana transaction(s);
2. invalidate the position cache;
3. poll open positions up to four times;
4. return failure if the position still appears open;
5. only then call `recordClose`, record performance, append a close decision, and return success.

Therefore `close_position success=true` means the position disappeared from the refreshed open-position set within the verification window. Transaction signatures are retained in `claim_txs`, `close_txs`, and `txs`.

Caveat: this is application-level finality based on confirmed transactions plus absence from the refreshed position list, not a separately stored finalized-commitment proof.

### State-sync auto-close

`syncOpenPositions()` marks a locally tracked position closed if it is absent on-chain after a five-minute deployment grace period. It does not record performance or a structured close decision.

These rows must be classified as:

`closure_quality = state_sync_unreconciled`

They count as closed lifecycle rows, but not as realized-performance trades until reconciled with external closed-position data.

## 4. Realized PnL and fee accounting

### Canonical source

Use `lessons.json.performance` as the canonical realized closed-trade series. It is one row per position in current data and reproduces the runtime formula exactly.

Runtime formula:

`raw_realized_pnl_usd = final_value_usd + fees_earned_usd - initial_value_usd`

Persisted values:

- `pnl_usd = round(raw_realized_pnl_usd, 2)`
- `pnl_pct = round(raw_realized_pnl_usd / initial_value_usd * 100, 2)` when initial value is positive; otherwise zero
- `range_efficiency = round(minutes_in_range / minutes_held * 100, 1)` when held time is positive; otherwise zero

All 460 current performance records match this runtime formula exactly when rounding is applied after using unrounded components.

### Meaning of components

For normal closed-API records:

- `initial_value_usd` comes from Meteora `allTimeDeposits.total.usd`.
- `final_value_usd` comes from Meteora `allTimeWithdrawals.total.usd`.
- `fees_earned_usd` comes from Meteora `allTimeFees.total.usd`.
- PnL therefore already includes all-time fees.

For fallback records, the implementation reconstructs a consistent USD decomposition from a pre-close cached position:

- `fees = collected fees + unclaimed fees`;
- `final = initial + pnl_true_usd - fees`.

The same persisted formula then remains true.

### No fee double-counting

Dashboard total realized PnL is:

`SUM(performance.pnl_usd)`

Dashboard observed fees is:

`SUM(performance.fees_earned_usd)`

Never calculate `pnl_usd + fees_earned_usd`. Fees are a decomposition of PnL, not an addition to it.

A useful non-fee residual may be displayed as:

`market_component_usd = pnl_usd - fees_earned_usd`

Label it “price/liquidity component after rounding,” not gross trading PnL, because execution costs and valuation details are incomplete.

### Costs

Solana network fees, priority fees, swap slippage, post-close swap PnL, and other transaction costs are not recorded in the performance ledger. Therefore:

- use the label **realized DLMM position PnL**;
- do not label it account net profit;
- do not claim after-cost profitability;
- do not subtract estimated costs in V1.

### Action versus performance PnL

For the 453 joined modern records:

- successful close action `result.pnl_usd` equals performance `pnl_usd` when rounded to cents;
- successful close action `result.pnl_pct` equals performance `pnl_pct` when rounded to two decimals;
- performance is recorded 2–102 ms before the action log line.

Use performance as canonical because it includes the accounting components and stable trade record. Keep action values as corroborating provenance.

### Units and solMode

Current `solMode` is false, and no action logs, agent logs, or tracked config history show it being enabled. Current records and values are consistent with USD.

However, runtime naming is unsafe: when `solMode=true`, close action `pnl_usd` can contain a SOL-denominated value. Performance still derives `pnl_usd` from USD deposit/withdrawal/fee components, so the performance ledger remains the preferred USD source.

Future instrumentation must store an explicit `unit`, `sol_mode`, `pnl_usd`, and `pnl_sol` instead of overloading names.

### Quality edge cases

One performance record has zero initial value, zero final value, zero fees, and zero PnL. It must be excluded from return, win-rate, and profit-factor denominators with:

`performance_quality = zero_cost_basis`

It may remain visible in the table and data-quality page.

## 5. Metric contract

Unless a metric says otherwise, apply the active global filters first.

### Eligible realized trade

A row is eligible for primary realized analytics when:

- it exists in `lessons.performance`;
- PnL components are finite numbers;
- `initial_value_usd > 0`;
- it is not marked invalid by reconciliation.

Legacy unlinked performance rows may be included with `quality=legacy_performance_only`, because they are internally formula-consistent. UI coverage must split verified modern rows from legacy-only rows.

### Realized PnL

`SUM(pnl_usd)` over eligible performance rows.

Current unfiltered source total: $25.76 across 460 persisted rows, before excluding the one zero-basis row.

### Fees

`SUM(fees_earned_usd)` over eligible performance rows.

Current unfiltered source total: $146.517157.

### Return

Per trade: persisted `pnl_pct`, or recompute from unrounded components for internal validation. Primary UI uses persisted `pnl_pct` so detail rows match Meridian.

Aggregate return metrics:

- arithmetic mean: `AVG(pnl_pct)`;
- median: standard median over non-null eligible values;
- never calculate portfolio return by summing trade percentages;
- do not capital-weight across overlapping trades unless explicitly labeled.

### Win, breakeven, loss

Use the persisted cent-level realized PnL and a one-cent neutral band:

- win: `pnl_usd > 0.01`;
- breakeven: `ABS(pnl_usd) <= 0.01`;
- loss: `pnl_usd < -0.01`.

The eligible denominator includes all three categories. The tolerance avoids classifying cent-rounded noise as a directional result.

Always expose counts and the threshold in the tooltip.

### Profit factor

`SUM(pnl_usd where pnl_usd > 0.01) / ABS(SUM(pnl_usd where pnl_usd < -0.01))`

- If no eligible rows: null.
- If gains exist and no losses: positive infinity, represented as `{ value: null, display: "∞", reason: "no_losses" }`.
- If neither gains nor losses: null.
- Breakeven rows do not enter numerator or denominator.

### Cumulative realized PnL

Order eligible trades by `recorded_at`, then position address as deterministic tie-breaker. Running sum of `pnl_usd`.

Label: **Cumulative realized closed-trade PnL**.

### Realized-close drawdown

From the cumulative realized PnL series:

- `peak_t = max(0, cumulative_0...cumulative_t)`;
- `drawdown_usd_t = cumulative_t - peak_t`;
- max drawdown is the minimum drawdown value.

Label: **Realized-close drawdown**. Do not show percentage drawdown or call it account drawdown.

### Tool reliability

Action success is a real boolean on every current JSONL row. Duration is a non-negative integer in milliseconds on every current row.

- tool success rate = successful actions / all logged actions;
- p50/p95 latency: nearest-rank percentile over `duration_ms`, per tool and overall;
- blocked pre-execution safety checks currently return before `logAction()` and are absent from action JSONL, so action denominators are “logged executions,” not all attempted tool calls.

### Deployment reliability

Action-level deployment success rate:

`successful deploy_position actions / logged deploy_position actions`

This measures tool execution, not screener decision quality. Current data contains 937 deploy actions: 466 success, 471 failure.

### Screening decision metrics

The recent structured log does not contain stable cycle IDs. For its retained window, classify:

- deliberate no-deploy: pre-filter/no-candidate/single-candidate skip or report explicitly containing `NO DEPLOY`, excluding reliability signatures;
- max-step failure: reason contains exact agent return `Max steps reached. Review logs for partial progress.`;
- no-tool failure: reason contains exact agent return `I couldn't complete that reliably because no tool call was made...`;
- deploy attempt failure: summary `Deploy attempt did not succeed`;
- unknown no-deploy: remaining `No successful deploy in screening cycle` records without a proven deliberate-no-deploy signature.

Do not compute a canonical all-history deployment conversion from current decision-log data because:

- the file retains only 100 decisions;
- there is no cycle ID;
- many no-deploy entries are reliability failures;
- pre-check failures and screening exceptions are not consistently persisted;
- some failed deploy tools may occur in manual/general sessions.

V1 may display **recent retained-window decision mix**, clearly labeled, and action-level deploy success. Canonical cycle conversion requires new instrumentation.

## 6. Decision contract

Current structured fields are stable:

- `id`, `ts`, `type`, `actor`, `pool`, `pool_name`, `position`, `summary`, `reason`, `risks[]`, `metrics{}`, `rejected[]`.

Current actors: `SCREENER`, `MANAGER`. Actor is role semantics, not model identity.

Decision types emitted by code include:

- `deploy`: appended inside `deployPosition` only after successful deployment handling and state tracking;
- `close`: appended only after close verification and performance handling, or for an untracked but verified close;
- `no_deploy`: filtering outcome, deliberate LLM skip, failed deploy, no successful tool use, or reliability failure;
- `skip`: max-position or insufficient-balance precondition skip.

Do not infer outcome solely from `type=no_deploy`; use reason/summary classification and preserve unknown.

Model is not stored in decisions.

## 7. Model, role, and cycle attribution

### Role

Role is available in structured decisions via `actor`. Tool actions do not store role, and management includes deterministic non-LLM closures as well as optional MANAGER LLM work.

Do not infer every close action as an LLM MANAGER action. It may have been executed by deterministic management rules or the fast PnL poller.

### Model

The screening log records model at cycle start. Verified model eras include GLM-5 Turbo, GLM-5.1, GLM-5.2, and GLM-5.3.

There is no model field or cycle ID on action, decision, position, or performance records. Timestamp-range inference is suitable only for an explicitly labeled exploratory view and must not be used for canonical per-model PnL or conversion metrics.

### Required new event contract

Before exact model/role/cycle analytics, emit immutable JSONL cycle events with:

- `cycle_id` UUID;
- `cycle_type` screening/management/health/manual;
- `started_at`, `ended_at`;
- configured model and actual used model;
- provider;
- role;
- status/outcome class;
- candidate counts;
- decision ID;
- related action event IDs;
- position and pool when applicable;
- step count;
- no-tool retries;
- error code/message;
- token usage and model latency when available.

## 8. Action JSONL contract

Current verified shape:

- ISO-8601 UTC `timestamp` ending in `Z`;
- string `tool`;
- object `args`;
- object `result` for 3,518 rows, or string `error` for one thrown failure;
- integer non-negative `duration_ms`;
- boolean `success`.

All 3,519 lines parse successfully.

`success` is computed as:

`result.success !== false && !result.error`

Caveats:

- protected-tool safety blocks return before action logging;
- unknown tools return before action logging;
- a result lacking explicit `success` can still count successful if it has no error;
- action results are summarized by executor before logging, not guaranteed to contain full provider payloads.

Close retries are separate action rows. Twelve positions have multiple close attempts; no position has more than one successful close action. Preserve every attempt and derive final position outcome separately.

Deploy actions are not automatically equivalent to screening cycles. Use them for execution reliability and confirmed deployment events.

### Redaction

Current action logs expose public wallet addresses, token mint addresses, and market data. No API/private-key field was found in current action paths, but the dashboard ingester must still recursively redact keys matching at least:

`api_key`, `apikey`, `authorization`, `secret`, `private`, `mnemonic`, `seed`, `bearer`, `llmApiKey`, `gmgnApiKey`, `hiveMindApiKey`, `publicApiKey`.

Wallet and token addresses are not secrets but should be treated as operationally sensitive and never included in unauthenticated remote telemetry.

## 9. Signal contract

Signals are staged in memory during screening and retrieved at successful deploy. They are persisted in the tracked position and later copied into performance.

Canonical historical signal source:

`lessons.performance[].signal_snapshot`

Current coverage: 304/460 performance rows (66.1%). Modern snapshot fields include:

- `base_mint`: token address;
- `organic_score`: screening organic score, observed numeric scale typically percent-like;
- `fee_tvl_ratio`: candidate fee/active-TVL ratio, percentage units as supplied by screening;
- `volume`: screening timeframe volume in USD-like source units;
- `mcap`: token market cap in USD-like source units;
- `holder_count`: count;
- `smart_wallets_present`: boolean;
- `narrative_quality`: currently categorical `present`/`absent`, not a quality score;
- `volatility`: source screening volatility value;
- entry market fields copied from position metadata.

`study_win_rate` and `hive_consensus` are defined in weighting code but absent from current persisted snapshots.

Snapshots are deployment-time observational features. Show historical association with outcomes and sample size; never claim causality or predictive validity.

`signal-weights.json.history` records weight changes and aggregate window counts, not per-candidate observations. It may power a separate “weight evolution” chart but must not be joined as raw signal evidence.

## 10. Snapshot and equity contract

`logger.logSnapshot(snapshot)` only prepends a timestamp and writes the supplied object to `logs/snapshots-YYYY-MM-DD.jsonl`.

There are no callers in the repository and no snapshot files. Therefore no payload schema, completeness guarantee, or valuation method exists.

V1 must not show:

- historical account equity;
- portfolio equity curve;
- account drawdown;
- historical capital utilization;
- Sharpe/Sortino based on account returns.

Before enabling those views, add a versioned snapshot event with:

- `schema_version`;
- `timestamp`;
- wallet SOL and USD value;
- token balances and USD value;
- each open position's position address, current value, cost basis, realized/claimed fees, unrealized PnL, and valuation source;
- total account equity;
- pricing timestamp/source and missing-price flags;
- explicit inclusion/exclusion of reserved gas and dust;
- unit and solMode.

## 11. Data-quality tiers

### Closed trade quality

1. `verified_modern`: performance + state + successful close action join by position.
2. `legacy_performance_only`: internally consistent performance row without state/action history.
3. `state_sync_unreconciled`: state auto-close without performance.
4. `verified_close_no_performance`: successful close action without performance because state metadata was missing.
5. `invalid_zero_cost_basis`: performance row with non-positive initial value.
6. `conflict`: duplicate or contradictory canonical records; none currently found among performance rows.

### Coverage metadata

Every aggregate response must include at least:

- total source rows;
- eligible rows;
- excluded rows by reason;
- verified-modern count;
- legacy-only count;
- missing-signal count;
- oldest and newest included timestamps;
- source freshness;
- warnings.

## 12. Ingestion implications

- Read only the allowlisted files documented above.
- Use JSONL byte cursors with inode/device, size, offset, source generation, and trailing partial-line storage.
- A shrunk file or changed inode starts a new generation; never delete ingested history.
- For mutable JSON, read one buffer, hash it, parse that same buffer, and transact all valid row upserts plus errors.
- Natural keys:
  - position: position address;
  - performance: position address, while retaining source hash/provenance;
  - decision: decision ID;
  - signal snapshot: position address + `deploy` observation kind;
  - action: source generation + byte offset.
- Mutable disappearance does not delete analytics history; mark `last_seen_at` and retain.
- Store unknown raw values in redacted JSON alongside normalized columns.

## 13. Instrumentation required for later analytics

Add, without changing trading behavior:

1. Versioned cycle JSONL events with IDs, model, role, status, and related entities.
2. Versioned portfolio snapshots with explicit valuation semantics.
3. Explicit PnL units, `pnl_usd`, `pnl_sol`, `fees_usd`, `fees_sol`, `sol_mode`, accounting basis, and cost inclusion flags.
4. Explicit performance provenance: `pnl_source = closed_api | preclose_cache`, closed API retrieval status, and settlement attempts.
5. Transaction-cost capture and post-close swap outcome if true account-net performance is desired.
6. Stable action event IDs propagated into cycle and decision events.
7. Structured failure codes instead of text-only max-step/no-tool signatures.
8. Atomic write strategy for mutable JSON (temporary file + rename) to reduce partial-read windows.

## 14. Implementation gate decision

The dashboard may now safely implement:

- realized DLMM closed-trade PnL and fee decomposition;
- win/breakeven/loss, mean/median return, profit factor;
- cumulative realized PnL and realized-close drawdown;
- positions and close/deploy drilldowns by position address;
- action success and latency metrics;
- recent retained-window decision classification;
- strategy/pool/signal cohort analytics with coverage labels;
- data-quality and reconciliation views.

The dashboard must defer or label unavailable:

- account-equity history and account drawdown;
- after-cost account net profit;
- exact historical per-model PnL or conversion;
- canonical all-history screening-cycle conversion;
- causal signal claims;
- historical open-position valuation.

This contract is the implementation source of truth unless runtime behavior or persisted schemas change. Any schema change must increment the analytics normalization version and add migration/fixture coverage.
