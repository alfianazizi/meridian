import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Create a fresh temp directory with a random suffix. */
export function makeTempDir(prefix = 'meridian-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Write a file, creating parent dirs. */
export function write(path: string, content: string): void {
  mkdirSync(dirnameOf(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function dirnameOf(p: string): string {
  return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.';
}

export function read(path: string): string {
  return readFileSync(path, 'utf8');
}
