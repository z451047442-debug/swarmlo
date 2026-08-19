// _sidecar.mjs — shared invocation helper for the BGE-VL Python sidecar.
//
// All swarmlo-bge-vl ops shell out to python rather than linking anything —
// honoring ADR-150's removability constraint + ADR-384's sidecar decision.
//
// CONTRACT
//   - resolvePython(): explicit SWARMLO_BGE_VL_PYTHON env → venv python
//     (~/.swarmlo/bge-vl/venv/...) → PATH probe (python/python3/py). Memoized.
//   - runSidecar(args, opts): spawnSync(python, ['-X','utf8', sidecar, ...args, '--json'])
//     → { ok, degraded, reason, json, stderr, exitCode }; hard timeout default 300s.
//   - exit code 3 from python (model deps missing) maps to
//     { degraded:true, reason:'bge-vl-model-deps-missing' } — never throws.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PLUGIN_DIR = join(__dirname, '..');
export const SIDECAR_PATH = join(PLUGIN_DIR, 'python', 'bge_vl_embed.py');

let RESOLVED_PYTHON = null;

export function resolvePython() {
  if (RESOLVED_PYTHON !== null) return RESOLVED_PYTHON;
  // Test seam (SWARMLO_BGE_VL_SKIP_PATH_PROBE=1): skip venv + PATH probes for a
  // deterministic degraded drill. An explicit SWARMLO_BGE_VL_PYTHON is still
  // honored, but only if it actually exists — a nonexistent explicit path
  // yields null (degraded) instead of falling through to PATH python.
  if (process.env.SWARMLO_BGE_VL_SKIP_PATH_PROBE === '1') {
    const explicit = process.env.SWARMLO_BGE_VL_PYTHON;
    if (explicit && existsSync(explicit)) return (RESOLVED_PYTHON = explicit);
    return (RESOLVED_PYTHON = null);
  }
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [];
  if (process.env.SWARMLO_BGE_VL_PYTHON) {
    candidates.push(process.env.SWARMLO_BGE_VL_PYTHON);
  }
  candidates.push(
    process.platform === 'win32'
      ? join(home, '.swarmlo', 'bge-vl', 'venv', 'Scripts', 'python.exe')
      : join(home, '.swarmlo', 'bge-vl', 'venv', 'bin', 'python3'),
  );
  candidates.push(...(process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']));
  for (const c of candidates) {
    if (!c.includes('/') && !c.includes('\\')) {
      const probe = spawnSync(c, ['-c', 'print(1)'], { timeout: 10_000 });
      if (probe.status === 0) return (RESOLVED_PYTHON = c);
    } else if (existsSync(c)) {
      return (RESOLVED_PYTHON = c);
    }
  }
  return (RESOLVED_PYTHON = null);
}

export function runSidecar(args, { timeoutMs = 300_000 } = {}) {
  const python = resolvePython();
  if (!python) {
    return {
      ok: false, degraded: true, reason: 'bge-vl-python-unavailable',
      json: null, stderr: '', exitCode: 127,
    };
  }
  const env = { ...process.env };
  // Map the swarmlo HF-mirror convention onto transformers' native var.
  if (env.CLAUDE_FLOW_HF_ENDPOINT && !env.HF_ENDPOINT) {
    env.HF_ENDPOINT = env.CLAUDE_FLOW_HF_ENDPOINT;
  }
  const r = spawnSync(python, ['-X', 'utf8', SIDECAR_PATH, ...args, '--json'], {
    encoding: 'utf8', env, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
  });
  let json = null;
  try { json = JSON.parse(r.stdout || 'null'); } catch { /* non-JSON stdout */ }
  const status = r.status ?? 1;
  if (status === 3) {
    return {
      ok: false, degraded: true,
      reason: /deps missing/.test(json?.error || '')
        ? 'bge-vl-model-deps-missing' : 'bge-vl-sidecar-error',
      json, stderr: r.stderr || '', exitCode: 3,
    };
  }
  return {
    ok: status === 0 && json?.ok === true, degraded: false,
    json, stderr: r.stderr || '', exitCode: status,
  };
}

export function emitDegradedJsonAndExit(reason, fix = 'run: npx swarmlo bge-vl setup') {
  console.log(JSON.stringify({ ok: false, degraded: true, reason, fix }, null, 2));
  process.exit(0);
}
