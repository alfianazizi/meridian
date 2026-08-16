import { describe, it, expect } from 'vitest';
import { redactSensitive, SENSITIVE_KEY_PATTERNS } from '../src/lib/redact.js';
import { isAllowedSourcePath, ALLOWED_SOURCES } from '../src/lib/allowlist.js';

describe('redaction', () => {
  it('recursively redacts sensitive keys at any depth', () => {
    const input = {
      api_key: 'sk-live-123',
      nested: {
        authorization: 'Bearer abc',
        deep: { private_key: '0xdeadbeef' },
        list: [{ mnemonic: 'word1 word2' }, { safe: 'keep' }],
      },
      llmApiKey: 'llm-secret',
      normal: 'this-stays',
    };
    const out = redactSensitive(input) as Record<string, unknown>;
    expect(out.api_key).toBe('[REDACTED]');
    expect((out.nested as any).authorization).toBe('[REDACTED]');
    expect((out.nested as any).deep.private_key).toBe('[REDACTED]');
    expect((out.nested as any).list[0].mnemonic).toBe('[REDACTED]');
    expect((out.nested as any).list[1].safe).toBe('keep');
    expect(out.llmApiKey).toBe('[REDACTED]');
    expect(out.normal).toBe('this-stays');
  });

  it('does not mutate the input object', () => {
    const input: any = { api_key: 'x', other: { nested_key: 'y' } };
    redactSensitive(input);
    expect(input.api_key).toBe('x');
    expect(input.other.nested_key).toBe('y');
  });

  it('handles primitives and arrays of strings', () => {
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive('hello')).toBe('hello');
    expect(redactSensitive(null)).toBeNull();
    const arr = redactSensitive(['a', { seed: 's' }]);
    expect(arr).toEqual(['a', { seed: '[REDACTED]' }]);
  });

  it('exposes the sensitive patterns from the contract', () => {
    for (const p of SENSITIVE_KEY_PATTERNS) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    }
  });
});

describe('allowlist', () => {
  it('permits the five contract sources only', () => {
    expect(ALLOWED_SOURCES.length).toBeLessThanOrEqual(5);
    expect(ALLOWED_SOURCES).toContain('state.json');
    expect(ALLOWED_SOURCES).toContain('lessons.json');
    expect(ALLOWED_SOURCES).toContain('decision-log.json');
    expect(ALLOWED_SOURCES.some((s) => s.startsWith('logs/actions-'))).toBe(true);
  });

  it('rejects arbitrary paths and traversal', () => {
    expect(isAllowedSourcePath('state.json')).toBe(true);
    expect(isAllowedSourcePath('lessons.json')).toBe(true);
    expect(isAllowedSourcePath('decision-log.json')).toBe(true);
    expect(isAllowedSourcePath('logs/actions-2026-04-18.jsonl')).toBe(true);
    expect(isAllowedSourcePath('passwd')).toBe(false);
    expect(isAllowedSourcePath('config.js')).toBe(false);
    expect(isAllowedSourcePath('../state.json')).toBe(false);
    expect(isAllowedSourcePath('../../etc/passwd')).toBe(false);
    expect(isAllowedSourcePath('logs/actions-../../x.jsonl')).toBe(false);
    expect(isAllowedSourcePath('some/arbitrary/path.json')).toBe(false);
  });
});
