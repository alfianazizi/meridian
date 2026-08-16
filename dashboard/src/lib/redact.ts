/**
 * Recursive redaction of operationally sensitive keys.
 *
 * Contract section 8 requires recursively redacting keys matching at least:
 * api_key, apikey, authorization, secret, private, mnemonic, seed, bearer,
 * llmApiKey, gmgnApiKey, hiveMindApiKey, publicApiKey.
 *
 * We match on a case-insensitive substring against the key name so all
 * camelCase / snake_case variants (e.g. llm_api_key, GMGN_API_KEY,
 * publicApiKey) are caught without enumerating every spelling.
 */
export const SENSITIVE_KEY_PATTERNS: string[] = [
  'api_key',
  'apikey',
  'authorization',
  'secret',
  'private',
  'mnemonic',
  'seed',
  'bearer',
  'llmapikey',
  'gmgnapikey',
  'hivemindapikey',
  'publicapikey',
  'password',
  'credential',
  'auth',
];

const REDACTED = '[REDACTED]';

function matchSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[_\-\s]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pat) => {
    const p = pat.toLowerCase().replace(/[_\-\s]/g, '');
    return lower.includes(p);
  });
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = matchSensitiveKey(k) ? REDACTED : redactSensitive(v);
    }
    return out;
  }
  return value;
}

export function redactJson(raw: string): string {
  try {
    return JSON.stringify(redactSensitive(JSON.parse(raw)));
  } catch {
    // Not parseable (e.g. a partial jsonl line) - return the original text so
    // the malformed line is still preserved for ingestion_errors.
    return raw;
  }
}

export function isRedacted(value: string): boolean {
  return value === REDACTED;
}
