/**
 * Types mirroring the read-only analytics API contract
 * (src/api/app.ts). Do not invent fields: unknown payload members stay
 * unknown and are rendered as unavailable, never as zero.
 */

export interface Coverage {
  eligible: number;
  included: number;
  total: number;
}

export interface Meta {
  freshness: string | null;
  coverage?: Coverage;
  pagination?: { page: number; page_size: number; total: number };
  warnings?: string[];
}

export interface Envelope<T> {
  data: T;
  meta: Meta;
}

export interface OverviewData {
  realized_pnl_usd: number;
  fees_earned_usd: number;
  trade_count: number;
  win_count: number;
  loss_count: number;
  breakeven_count: number;
  win_rate: number | null;
  average_return_pct: number | null;
  median_return_pct: number | null;
  profit_factor: { value: number | null; state: 'no_wins' | 'infinite' | 'finite' };
}

export interface SeriesPoint {
  position: string;
  recorded_at: string;
  pnl_usd: number;
  fees_earned_usd: number;
  pnl_pct: number;
  cumulative_pnl_usd: number;
  drawdown_usd: number;
}

export interface ToolReliability {
  tool: string;
  count: number;
  success_count: number;
  error_count: number;
  success_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
}

export interface ReliabilitySummaryData {
  tool_actions: number;
  successful_tool_actions: number;
  tool_success_rate: number | null;
  recent_reliability_failures: number;
}

export interface StrategRow {
  strategy: string;
  sample_size: number;
  realized_pnl_usd: number;
  fees_earned_usd: number;
  average_return_pct: number;
  win_rate: number;
}

export interface PositionRow {
  position: string;
  pool: string | null;
  pool_name: string | null;
  strategy: string | null;
  amount_sol: number | null;
  deployed_at: string | null;
  closed_at: string | null;
  closed: number;
  closure_quality: string | null;
}

export interface PositionDetail {
  position: string;
  pool?: string | null;
  pool_name?: string | null;
  strategy?: string | null;
  amount_sol?: number | null;
  initial_value_usd?: number | null;
  bin_range_min?: number | null;
  bin_range_max?: number | null;
  bin_step?: number | null;
  volatility?: number | null;
  fee_tvl_ratio?: number | null;
  organic_score?: number | null;
  deployed_at?: string | null;
  closed_at?: string | null;
  closed?: number;
  autoclose?: number | null;
  closure_quality?: string | null;
  signal_snapshot?: string | null;
  pnl_usd?: number | null;
  pnl_pct?: number | null;
  fees_earned_usd?: number | null;
  performance_quality?: string | null;
  close_reason?: string | null;
  recorded_at?: string | null;
}

export interface DecisionRow {
  id: string;
  ts: string | null;
  type: string | null;
  actor: string | null;
  pool: string | null;
  pool_name: string | null;
  position: string | null;
  summary: string | null;
  reason: string | null;
  risks_json: string | null;
  metrics_json: string | null;
  rejected_json: string | null;
}

export interface DataQualityData {
  sources: {
    name: string;
    kind: string;
    state: string;
    last_seen_at: string;
    cursor_offset?: number;
    size?: number;
  }[];
  performance_quality: { quality: string; count: number }[];
  closure_quality: { quality: string; count: number }[];
  ingestion_errors: number;
  signal_records: number;
  signal_coverage: number | null;
}

export interface FiltersData {
  pools: { pool: string; pool_name: string | null }[];
  strategies: string[];
  roles: string[];
  tools: string[];
}

export interface MetaData {
  read_only: boolean;
  schema_version: number;
}
export interface ModelPerformanceRow{model:string;provider:string|null;authoritative:boolean;sample_count:number;p50_ms:number|null;p90_ms:number|null;success_rate:number|null;failure_rate:number|null;deploy_count:number;no_deploy_count:number;agreement_rate:number|null;agreement_sample:number}
export interface ModelRun{cycle_id:string;ts:string;provider:string;model:string;authoritative:number;duration_ms:number|null;status:string;decision:'deploy'|'no_deploy'|null;candidate_count:number;selected_pool:string|null;error_class:string|null}
export interface ModelPerformanceData{models:ModelPerformanceRow[];comparisons:{cycle_id:string;runs:ModelRun[]}[]}