#!/usr/bin/env node
/**
 * Fix fabricated/unsubstantiated performance multipliers in "live" docs.
 *
 * Scope: ONLY live-loaded docs (.claude/skills, .agents/skills, .claude/agents,
 * .claude/commands, and the v3/@claude-flow/{cli,mcp}/.claude packaged copies).
 *
 * Deliberately EXCLUDED (historical record / audit docs — these use the numbers
 * to DEBUNK them, or are planning archives; editing them rewrites history):
 *   - docs/reviews/**
 *   - v3/implementation/**, v3/docs/adr/**, docs/dream-cycle dirs, v3/CHANGELOG.md
 *
 * Ground truth: docs/reviews/intelligence-system-audit-2026-05-29.md (measured).
 *
 * Replacement map (all sourced from the audit's measured values):
 *   HNSW "150x-12,500x"  -> measured ~1.9x (N=20k) / ~3.2-4.7x (N=5k)
 *   Flash "2.49x-7.47x"  -> fabricated at runtime (Math.random), dropped
 *   embeddings "75x"     -> no benchmark
 *   "50-75% memory"      -> no benchmark
 *
 * Usage: node scripts/fix-live-doc-perf-claims.mjs          (dry-run)
 *        node scripts/fix-live-doc-perf-claims.mjs --apply  (write)
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');

const ROOT = resolve(process.cwd());
const LIVE_DIRS = [
  '.claude/skills',
  '.agents/skills',
  'v3/@claude-flow/cli/.claude/skills',
  '.claude/agents',
  'v3/@claude-flow/cli/.claude/agents',
  '.claude/commands',
  'v3/@claude-flow/mcp/.claude',
];

// Ordered so that longer/compound forms match before bare forms.
const REPLACEMENTS = [
  // HNSW search speedup — audit measured ~1.9x (N=20k) / ~3.2-4.7x (N=5k).
  [/150x-12,500x/g, '~1.9x-4.7x'],
  [/150x-12500x/g, '~1.9x-4.7x'],
  [/150x - 12,500x/g, '~1.9x - 4.7x'],
  [/\[150, 12500\]/g, '[1.9, 4.7]'],
  [/\[150,12500\]/g, '[1.9, 4.7]'],
  [/12,500x/g, '~4.7x'],
  // Flash Attention — fabricated (Math.random at runtime), no measured value.
  [/2\.49x-7\.47x/g, 'unmeasured'],
  [/2\.49x - 7\.47x/g, 'unmeasured'],
  [/\[2\.49, 7\.47\]/g, '[unmeasured]'],
  [/\[2\.49,7\.47\]/g, '[unmeasured]'],
  [/2\.49x/g, 'unmeasured'],
  [/7\.47x/g, 'unmeasured'],
  // embeddings "75x faster" — no benchmark anywhere.
  [/75x faster/g, 'unmeasured faster'],
  [/75x/g, 'unmeasured'],
  // memory reduction "50-75%" — no benchmark.
  [/50-75% memory/g, 'unverified memory'],
  [/50-75%/g, 'unverified'],
  // time/cache/message "30-50%" — v3 target, no benchmark.
  [/30-50% time reduction/g, 'unverified time reduction'],
  [/30-50% faster message delivery/g, 'unverified faster message delivery'],
  [/30-50% faster/g, 'unverified faster'],
  [/30-50%/g, 'unverified'],
  // bare 150x (HNSW) after compound forms handled.
  [/150x/g, '~1.9x'],
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = [];
for (const d of LIVE_DIRS) {
  const abs = join(ROOT, d);
  walk(abs, files);
}

let changedFiles = 0;
let changedLines = 0;
for (const f of files) {
  const original = readFileSync(f, 'utf8');
  let out = original;
  let perFile = 0;
  for (const [re, repl] of REPLACEMENTS) {
    out = out.replace(re, repl);
  }
  // count changed lines by diffing line arrays
  const a = original.split('\n');
  const b = out.split('\n');
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      perFile++;
      changedLines++;
      if (!APPLY) {
        const rel = f.replace(ROOT + '/', '');
        console.log(`\n--- ${rel}:${i + 1}`);
        console.log(`  - ${a[i].trim()}`);
        console.log(`  + ${b[i].trim()}`);
      }
    }
  }
  if (perFile > 0) {
    changedFiles++;
    if (APPLY) writeFileSync(f, out, 'utf8');
  }
}

console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — ${changedFiles} files, ${changedLines} changed lines`);
