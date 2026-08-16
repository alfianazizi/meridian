import { basename, isAbsolute, normalize, relative, sep } from 'node:path';

export type SourceKind = 'state' | 'lessons' | 'decisions' | 'actions_jsonl' | 'model_telemetry_jsonl';

export const ALLOWED_SOURCES = [
  'state.json',
  'lessons.json',
  'decision-log.json',
  'logs/actions-*.jsonl',
  'logs/model-screening.jsonl',
] as const;

export interface AllowedSource {
  label: string;
  kind: SourceKind;
  jsonl: boolean;
}

function normalizedLogicalPath(value: string): string | null {
  const normalized = normalize(value).split(sep).join('/');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    return null;
  }
  if (!isAbsolute(value)) return normalized.replace(/^\.\//, '');

  const base = basename(normalized);
  if (base === 'state.json' || base === 'lessons.json' || base === 'decision-log.json') return base;
  const parts = normalized.split('/');
  if (parts.at(-2) === 'logs' && /^actions-[^/]+\.jsonl$/.test(base)) return `logs/${base}`;
  if (parts.at(-2) === 'logs' && base === 'model-screening.jsonl') return `logs/${base}`;
  return null;
}

export function isAllowedSourcePath(value: string): boolean {
  const logical = normalizedLogicalPath(value);
  if (!logical) return false;
  if (logical === 'state.json' || logical === 'lessons.json' || logical === 'decision-log.json') return true;
  if (logical === 'logs/model-screening.jsonl') return true;
  return /^logs\/actions-[^/]+\.jsonl$/.test(logical);
}

export function allowedSourceFor(value: string): AllowedSource | null {
  const logical = normalizedLogicalPath(value);
  if (!logical || !isAllowedSourcePath(value)) return null;
  if (logical === 'state.json') return { label: logical, kind: 'state', jsonl: false };
  if (logical === 'lessons.json') return { label: logical, kind: 'lessons', jsonl: false };
  if (logical === 'decision-log.json') return { label: logical, kind: 'decisions', jsonl: false };
  if (logical === 'logs/model-screening.jsonl') return { label: basename(logical), kind: 'model_telemetry_jsonl', jsonl: true };
  return { label: basename(logical), kind: 'actions_jsonl', jsonl: true };
}