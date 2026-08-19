#!/usr/bin/env node
/**
 * Long-term guard after the 2026-08-20 rename to `swarmlo-cli`: assert the
 * repo contains no executable references to the UPSTREAM package
 * `@claude-flow/cli@<tag>` (npx spawns, npm install commands, registry
 * queries). ruvnet continues to publish that package; any stray reference
 * silently routes fork users to the upstream channel instead of the
 * fork-owned swarmlo-cli.
 *
 * Whitelisted (historical, never changed per repo rename convention):
 *   - v3/docs/adr/**, v3/implementation/** (historical ADRs & reports)
 *   - docs/**, CHANGELOG*, verification/** (signed/historical artifacts)
 *   - dist/**, node_modules/**, .git/**, package-lock.json, pnpm-lock.yaml
 *   - this script and the cli-core migration tool (they INTENTIONALLY
 *     reference the old name to detect/migrate legacy call sites)
 *
 * Only the executable form `@claude-flow/cli@<version-or-tag>` is flagged —
 * plain path references (v3/@claude-flow/cli/...) are legitimate and remain.
 *
 * Exit codes: 0 — clean; 1 — violations listed.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const EXEC_REF = /@claude-flow\/cli@[\w.\-]+/g;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-cjs', '.vs', '.idea', '.vscode',
]);
const SKIP_PATHS = [
  'v3/docs/adr', 'v3/docs/releases', 'v3/implementation', 'docs', 'verification',
  'CHANGELOG.md', 'CHANGELOG.zh-CN.md',
  // User-local files (root CLAUDE.md is gitignored; CLAUDE.local.md is private)
  'CLAUDE.md', 'CLAUDE.local.md',
  // Historical plugin ADRs and intentional test fixtures keep the old name
  // per the repo rename convention (5f9d2ae).
  'plugins/swarmlo-workflows/scripts/fixtures',
  'embedding-models-2026-08-16.md',
  '.github/supply-chain/accepted-findings.json',
];
const SKIP_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml',
]);

function isSkippedDir(relPath) {
  for (const p of SKIP_PATHS) {
    if (relPath === p || relPath.startsWith(p + '/')) return true;
  }
  return false;
}

const violations = [];

function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      const rel = relative(ROOT, p).replace(/\\/g, '/');
      if (!isSkippedDir(rel)) walk(p);
      continue;
    }
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    if (SKIP_FILES.has(e) || rel.endsWith('.lock.yaml')) continue;
    if (isSkippedDir(rel) || rel.includes('/docs/adrs/') || rel.includes('/docs/benchmarks/')) continue;
    // Tests for the runaway-detection migration intentionally fixture the
    // legacy upstream name (that IS the production scenario being detected).
    if (rel === 'v3/@claude-flow/cli/__tests__/doctor-2677-stale-settings.test.ts') continue;
    // This script and the cli-core migration tool intentionally match the
    // old name to guard against / migrate legacy references.
    if (rel === 'scripts/audit-no-upstream-cli-refs.mjs') continue;
    if (rel === 'scripts/audit-codex-integration.mjs') continue; // message intentionally names the old refs it detects
    if (rel === 'v3/@claude-flow/cli-core/scripts/migrate-plugin-call-sites.mjs') continue;
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(EXEC_REF)) {
      violations.push(`${rel}: ${m[0]}`);
    }
  }
}

walk(ROOT);

if (violations.length === 0) {
  console.log('audit-no-upstream-cli-refs: ok — no executable @claude-flow/cli@ references outside historical whitelist');
  process.exit(0);
}

console.error(`audit-no-upstream-cli-refs: ${violations.length} upstream CLI reference(s) found:`);
for (const v of violations.slice(0, 50)) console.error(`  ✗ ${v}`);
if (violations.length > 50) console.error(`  … and ${violations.length - 50} more`);
console.error('Replace with swarmlo-cli@<tag> or add to the historical whitelist in this script.');
process.exit(1);
