#!/usr/bin/env node
// bge-vl.mjs — CLI relay for the BGE-VL Python sidecar (ADR-384).
//
// OPS
//   embed  --text "..." [--image <path>] [--model <hf-id>] [--db <path>]
//   store  --key <k> --vector '[768 floats]' [--kind text|image|composed] [--payload {...}]
//          --key <k> --text "..."        (convenience: embed then store)
//   search --text "..." | --image <path> | --vector '[...]'
//          [--top-k N] [--threshold T] [--mmr-lambda L] [--db <path>]
//   health | list [--limit N] | delete --key <k> | purge
//   setup                                 (venv + deps; needs network once)
//
// EXIT CODES
//   0  ok — or degraded (python/model deps unavailable)
//   2  usage/storage/sidecar error
//   3  sidecar degraded (reserved; relay re-emits degraded as exit 0 per ADR-150)

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  PLUGIN_DIR, runSidecar, resolvePython, emitDegradedJsonAndExit,
} from './_sidecar.mjs';

const ARGS = (() => {
  const a = { db: null };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === '--db') a.db = process.argv[++i];
    else if (v === '--key') a.key = process.argv[++i];
    else if (v === '--vector') a.vector = process.argv[++i];
    else if (v === '--text') a.text = process.argv[++i];
    else if (v === '--image') a.image = process.argv[++i];
    else if (v === '--model') a.model = process.argv[++i];
    else if (v === '--kind') a.kind = process.argv[++i];
    else if (v === '--payload') a.payload = process.argv[++i];
    else if (v === '--top-k') a.topK = parseInt(process.argv[++i], 10);
    else if (v === '--threshold') a.threshold = parseFloat(process.argv[++i]);
    else if (v === '--mmr-lambda') a.mmrLambda = parseFloat(process.argv[++i]);
    else if (v === '--limit') a.limit = parseInt(process.argv[++i], 10);
    else a[`_${i}`] = v; // positional crumbs
  }
  a.op = process.argv[2];
  return a;
})();

function sidecarArgs(extra = []) {
  const out = [...extra];
  if (ARGS.db) out.push('--db', ARGS.db);
  return out;
}

function failExit(message, code = 2) {
  console.error(`bge-vl: ${message}`);
  process.exit(code);
}

function emitOrFail(r) {
  if (r.degraded) {
    emitDegradedJsonAndExit(r.reason);
  }
  if (!r.ok) {
    console.error(r.json?.error || r.stderr || `sidecar exit ${r.exitCode}`);
    process.exit(2);
  }
  return r;
}

function cmdEmbed() {
  if (!ARGS.text && !ARGS.image) failExit('embed needs --text and/or --image');
  const r = emitOrFail(runSidecar(sidecarArgs(
    ['embed', ...(ARGS.text ? ['--text', ARGS.text] : []),
     ...(ARGS.image ? ['--image', ARGS.image] : []),
     ...(ARGS.model ? ['--model', ARGS.model] : [])],
  )));
  console.log(JSON.stringify({ ok: true, dim: r.json.dim, model: r.json.model, vector: r.json.vector }, null, 2));
}

function cmdStore() {
  if (ARGS.key === undefined) failExit('store needs --key');
  let vector = ARGS.vector;
  if (!vector) {
    if (!ARGS.text) failExit('store needs --vector or --text');
    const e = emitOrFail(runSidecar(sidecarArgs(['embed', '--text', ARGS.text])));
    vector = JSON.stringify(e.json.vector);
  }
  const r = emitOrFail(runSidecar(sidecarArgs(
    ['store', '--key', ARGS.key, '--vector', vector,
     '--kind', ARGS.kind || 'text', '--payload', ARGS.payload || '{}'],
  )));
  console.log(JSON.stringify(r.json, null, 2));
}

function cmdSearch() {
  if (!ARGS.text && !ARGS.image && !ARGS.vector) {
    failExit('search needs --text, --image, or --vector');
  }
  let vector = ARGS.vector;
  if (!vector) {
    const e = emitOrFail(runSidecar(sidecarArgs(
      ['embed', ...(ARGS.text ? ['--text', ARGS.text] : []),
       ...(ARGS.image ? ['--image', ARGS.image] : [])],
    )));
    vector = JSON.stringify(e.json.vector);
  }
  const r = emitOrFail(runSidecar(sidecarArgs(
    ['search', '--vector', vector, '--top-k', String(ARGS.topK ?? 10),
     '--mmr-lambda', String(ARGS.mmrLambda ?? 1.0),
     ...(ARGS.threshold !== undefined ? ['--threshold', String(ARGS.threshold)] : [])],
  )));
  console.log(JSON.stringify(r.json, null, 2));
}

function cmdSetup() {
  const python = resolvePython();
  if (!python) {
    emitDegradedJsonAndExit('bge-vl-python-unavailable', 'install Python 3.10+ then rerun `npx swarmlo bge-vl setup`');
    return;
  }
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const venvDir = join(home, '.swarmlo', 'bge-vl', 'venv');
  const venvPython = process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python3');
  const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', env: process.env, timeout: 600_000 });
  let r = run(python, ['-m', 'venv', venvDir]);
  if ((r.status ?? 1) !== 0) failExit('venv creation failed');
  r = run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  if ((r.status ?? 1) !== 0) failExit('pip upgrade failed');
  const cpuIndex = process.env.SWARMLO_BGE_VL_CPU_ONLY !== '0'
    ? ['--index-url', 'https://download.pytorch.org/whl/cpu']
    : [];
  r = run(venvPython, ['-m', 'pip', 'install', 'torch>=2.1', ...cpuIndex]);
  if ((r.status ?? 1) !== 0) failExit('torch install failed');
  r = run(venvPython, ['-m', 'pip', 'install', '-r', join(PLUGIN_DIR, 'python', 'requirements.txt')]);
  if ((r.status ?? 1) !== 0) failExit('requirements install failed');
  const health = runSidecar(['health']);
  if (!health.ok) failExit(`sidecar health after setup failed: ${health.stderr}`);
  console.log(JSON.stringify({ ok: true, setup: 'complete', venv: venvDir, health: health.json }, null, 2));
}

switch (ARGS.op) {
  case 'embed': cmdEmbed(); break;
  case 'store': cmdStore(); break;
  case 'search': cmdSearch(); break;
  case 'health': case 'list': case 'delete': case 'purge': {
    const r = emitOrFail(runSidecar(sidecarArgs(
      [ARGS.op, ...(ARGS.key ? ['--key', ARGS.key] : []),
       ...(ARGS.limit ? ['--limit', String(ARGS.limit)] : [])],
    )));
    console.log(JSON.stringify(r.json, null, 2));
    break;
  }
  case 'setup': cmdSetup(); break;
  default: failExit(`unknown op '${ARGS.op ?? '(none)'}' — embed|store|search|health|list|delete|purge|setup`);
}
