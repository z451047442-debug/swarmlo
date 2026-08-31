#!/usr/bin/env node
// threat-model.mjs — wrapper around `harness threat-model <path>`.
//
// USAGE
//   node scripts/threat-model.mjs --path . --fail-on high --format json

// review fix 2026-08-31 — SEVERITY_RANK imported from _harness.mjs instead of
// a local literal that was missing `critical` (a CRITICAL worst verdict
// silently failed to trip `--fail-on high` — the security gate no-op'd).
import { runHarness, emitDegradedJsonAndExit, SEVERITY_RANK, rankSeverity } from './_harness.mjs';

const ARGS = (() => {
  const a = { path: '.', format: 'json', failOn: 'high' };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === '--path') a.path = process.argv[++i];
    else if (v === '--fail-on') a.failOn = String(process.argv[++i] || 'high').toLowerCase();
    else if (v === '--format') a.format = process.argv[++i];
  }
  return a;
})();

function main() {
  if (!SEVERITY_RANK.hasOwnProperty(ARGS.failOn)) {
    console.error(`threat-model: --fail-on must be one of clean|low|medium|high|critical`);
    process.exit(2);
  }
  const r = runHarness(['threat-model', ARGS.path]);
  if (r.degraded) { emitDegradedJsonAndExit(r.reason); return; }
  // Upstream uses exit 2 for a valid HIGH verdict. A parsed JSON payload is
  // authoritative regardless of that domain exit code; only reject a
  // non-zero invocation when it produced no structured result.
  if (!r.json && r.exitCode !== 0 && r.exitCode !== 1) {
    console.error(`threat-model: harness exited ${r.exitCode}`);
    if (r.stderr) console.error(r.stderr.slice(0, 400));
    process.exit(2);
  }
  const payload = r.json ?? { rawStdout: r.stdout.slice(0, 400) };
  const worst = String(payload?.worst || 'clean').toLowerCase();
  const threshold = SEVERITY_RANK[ARGS.failOn];
  // rankSeverity() — safe accessor: unknown severities rank 0 (never NaN).
  const triggered = rankSeverity(worst) >= threshold && threshold > 0;
  const alert = {
    threshold: ARGS.failOn, worst, triggered,
    reason: triggered
      ? `worst=${worst} at or above ${ARGS.failOn}`
      : `worst=${worst} below ${ARGS.failOn} — OK`,
  };

  if (ARGS.format === 'json') {
    console.log(JSON.stringify({ ...payload, durationMs: r.durationMs, alert }, null, 2));
  } else {
    console.log(`# harness threat-model — ${ARGS.path}`);
    console.log('');
    console.log(`Worst severity: ${worst}`);
    console.log(`Findings: ${(payload?.findings || []).length}`);
    console.log('');
    console.log(alert.triggered ? `⚠ **ALERT**: ${alert.reason}` : `✓ ${alert.reason}`);
  }

  if (alert.triggered) process.exit(1);
}

main();
