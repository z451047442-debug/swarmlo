// test-self.mjs — plugin self-test drill (CI + local).
// 1. Degraded path: forced-missing python → exit 0 + {degraded:true}.
// 2. Stdlib health drill: real python (if any) → health JSON dim 768.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));

function drill(args, env) {
  return spawnSync('node', [join(HERE, 'bge-vl.mjs'), ...args], {
    encoding: 'utf8', env: { ...process.env, ...env },
  });
}

// 1. degraded drill — exit 0 + degraded:true (ADR-150 rule #3).
{
  const r = drill(['embed', '--text', 'x'], {
    SWARMLO_BGE_VL_PYTHON: '/nonexistent-python',
    SWARMLO_BGE_VL_SKIP_PATH_PROBE: '1',
  });
  assert.strictEqual(r.status, 0, `degraded drill exit ${r.status}: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.degraded, true, `not degraded: ${r.stdout}`);
  assert.strictEqual(j.reason, 'bge-vl-python-unavailable', `unexpected reason ${j.reason}`);
  assert.ok(j.fix, 'missing fix hint');
  console.log('✓ degraded drill (reason:', j.reason + ')');
}

// 2. stdlib health drill — runs when any python exists; dim must be 768.
{
  const db = join(mkdtempSync(join(os.tmpdir(), 'bgevl-')), 't.db');
  const r = drill(['health', '--db', db]);
  const j = JSON.parse(r.stdout || 'null');
  if (j && j.degraded) {
    console.log('○ no python on PATH — health drill skipped');
  } else {
    assert.strictEqual(r.status, 0, `health drill exit ${r.status}`);
    assert.strictEqual(j.dim, 768, `health dim ${j.dim}`);
    console.log('✓ health drill (dim 768)');
  }
}

console.log('✓ test-self.mjs complete');
