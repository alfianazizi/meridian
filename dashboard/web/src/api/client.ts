import type {
  DataQualityData,
  DecisionRow,
  Envelope,
  FiltersData,
  Meta,
  MetaData,
  OverviewData,
  PositionDetail,
  PositionRow,
  ReliabilitySummaryData,
  SeriesPoint,
  StrategRow,
  ToolReliability,
} from './types';

const JSON_HEADERS = { Accept: 'application/json' };

/**
 * Same-origin fetch wrapper. API failures surface as thrown Errors with a
 * status so pages can distinguish error from empty. Unknown response shapes
 * are not coerced: pages only read fields the contract defines.
 */
export async function apiGet<T>(path: string): Promise<Envelope<T>> {
  const res = await fetch(path, { headers: JSON_HEADERS });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string; details?: unknown };
      detail = body.error ?? `HTTP ${res.status}`;
    } catch {
      detail = `HTTP ${res.status}`;
    }
    throw new Error(`${path}: ${detail}`);
  }
  return (await res.json()) as Envelope<T>;
}

export const getOverview = (params: URLSearchParams) =>
  apiGet<OverviewData>(`/api/overview?${params.toString()}`);

export const getSeries = (params: URLSearchParams) =>
  apiGet<SeriesPoint[]>(`/api/performance/series?${params.toString()}`);

export const getReliabilitySummary = () => apiGet<ReliabilitySummaryData>('/api/reliability/summary');

export const getToolReliability = (tool: string | null) =>
  apiGet<ToolReliability[]>(`/api/reliability/tools${tool ? `?tool=${encodeURIComponent(tool)}` : ''}`);

export const getStrategies = (params: URLSearchParams) =>
  apiGet<StrategRow[]>(`/api/strategies?${params.toString()}`);

export const getPositions = (params: URLSearchParams) =>
  apiGet<PositionRow[]>(`/api/positions?${params.toString()}`);

export const getPosition = (position: string) => apiGet<PositionDetail>(`/api/positions/${encodeURIComponent(position)}`);

export const getDecisions = (params: URLSearchParams) =>
  apiGet<DecisionRow[]>(`/api/decisions?${params.toString()}`);

export const getDataQuality = () => apiGet<DataQualityData>('/api/data-quality');

export const getFilters = () => apiGet<FiltersData>('/api/filters');

export const getMeta = () => apiGet<MetaData>('/api/meta');

const params = (query = '') => new URLSearchParams(query);
export const api = {
  overview: (query = '') => getOverview(params(query)),
  series: (query = '') => getSeries(params(query)),
  reliability: getReliabilitySummary,
  tools: () => getToolReliability(null),
  strategies: (query = '') => getStrategies(params(query)),
  positions: (query = '') => getPositions(params(query)),
  position: getPosition,
  decisions: (query = '') => getDecisions(params(query)),
  quality: getDataQuality,
  filters: getFilters,
  meta: getMeta,
};

export { type Meta };