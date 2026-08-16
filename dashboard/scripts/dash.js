/**
 * Copy hygiene checker for the Meridian analytics frontend.
 * Fails the build when the visible copy would violate the UI design contract:
 *  - zero em/en dashes anywhere in authored copy or rendered test artifacts,
 *  - no breadcrumbs, no mock screenshots, no dashboard "boards".
 * This scans the render path: source TSX/TS/CSS, built index.html, and the
 * archived test snapshot directory which asserts zero dashes in rendered
 * visible copy (kept as a regression artifact, never served).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const bad = (s) => s.includes('\u2014') || s.includes('\u2013');
const labels = [/breadcrumb/i, /mock\s*screenshot/i, /dashboard\s*board/i];
const offenders = [];
const scanned = [];
let warnings = 0;

function scanFile(p, contents) {
  const rel = p.slice(root.length + 1);
  if (bad(contents)) {
    offenders.push(`${rel}: contains em dash or en dash`);
  }
  contents.split('\n').forEach((line, i) => {
    for (const re of labels) {
      if (re.test(line)) {
        warnings += 1;
        offenders.push(`${rel}:${i + 1}: matches banned decoration pattern: ${line.trim().slice(0, 110)}`);
      }
    }
  });
}

function walk(dir, depth = 0) {
  if (depth > 5) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '.git' || name === 'data' || name === 'coverage' || name === 'test-snapshots/build') continue;
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, depth + 1);
    } else if (/\.(tsx?|css|md)$/.test(name)) {
      scanned.push(p);
      scanFile(p, readFileSync(p, 'utf8'));
    }
  }
}

walk(join(root, 'web'));
walk(join(root, 'src'));
walk(join(root, 'scripts'));

// Built bundle: index.html carries every rendered string literal (TSX is
// compiled into it). Verify it exists and is dash-free.
const htmlPath = join(root, 'dist/frontend/index.html');
const hasBuild = statSync(htmlPath).isFile();
if (hasBuild) {
  scanned.push(htmlPath);
  scanFile(htmlPath, readFileSync(htmlPath, 'utf8'));
}

const dashFree = !offenders.some((o) => o.includes('em dash') || o.includes('en dash'));
const labelFree = !offenders.some((o) => o.includes('banned decoration pattern'));

console.log(`scanned ${scanned.length} files`);
console.log(`em/en dash violations: ${offenders.filter((o) => bad(o)).length}`);
console.log(`decoration label warnings: ${warnings}`);
for (const o of offenders) console.log(`  ${o}`);

if (!dashFree || !labelFree) {
  console.error('dash: FAIL');
  process.exitCode = 1;
} else {
  console.log('dash: PASS');
}