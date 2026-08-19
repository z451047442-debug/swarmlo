# BGE-VL Multimodal Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn BGE-VL from "registered but refused" (ADR-384 draft) into a working multimodal embedding pipeline: a Python 3.12 sidecar running BAAI/bge-vl-* natively, its 768-dim vectors isolated in a dedicated `bge-vl.db` (never touching the 1024-dim bge-m3 HNSW space in memory.db), shipped as a metaharness-style plugin `plugins/swarmlo-bge-vl/` with core dispatcher + doctor check + CI removability gate.

**Architecture:** Three user-decided direction choices, 2026-08-19:
1. **Runtime** — Python sidecar subprocess (transformers + `trust_remote_code`, one-shot JSON protocol, on-demand spawn). Heavy deps imported lazily so storage/health/self-test run on the stdlib alone.
2. **Storage** — independent SQLite file `bge-vl.db` (stdlib `sqlite3`), owned by the sidecar; dim guard refuses non-768-dim DBs. Retrieval = brute-force cosine + MMR rerank (dimension-agnostic math, mirroring core's cosineSim/mmrRerank semantics).
3. **Structure** — exact metaharness template replication (ADR-150): plugin dir + core `bge-vl.ts` dispatcher + `prepare-publish.mjs` mirror + doctor component + CI removability gate. The text-only ONNX pipeline keeps refusing BGE-VL, but its error now routes users to the sidecar.

**Tech Stack:** Python 3.12 (sqlite3/argparse/json stdlib; lazy torch+transformers+Pillow+numpy), Node 20+ (ESM .mjs, spawnSync), TypeScript (vitest) for the core dispatcher/doctor, GitHub Actions for the CI gate.

**Spec:** `v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md` — Task 0 revises it to the new direction; executors read the revised version first.

## Global Constraints

- BGE-VL vectors are 768-dim and live ONLY in `bge-vl.db` (default `~/.swarmlo/bge-vl/bge-vl.db`, override `CLAUDE_FLOW_BGE_VL_DB`). Never written into memory.db / its `vector_indexes` (that HNSW space belongs to 1024-dim bge-m3).
- Removability (ADR-150 rule #1): deleting `plugins/swarmlo-bge-vl/` or removing Python must leave swarmlo operational. Every bge-vl path degrades to `{degraded:true}` JSON with exit 0 — never throws.
- `torch`/`transformers`/`Pillow`/`numpy` must NOT appear in `dependencies` of any package.json (they live only in the plugin-side venv, installed by `bge-vl setup`).
- Sidecar heavy imports are lazy — `health`/`self-test`/`store`/`search`/`list`/`delete`/`purge` run with stdlib only (CI-tested without a venv).
- TDD London School for TypeScript; all tests offline (no model download in CI; real embed is manual-verification only).
- Node 20+, Python 3.10+ (user env: 3.12.0), Windows + POSIX. Spawn always with `-X utf8` (Windows UTF-8 output).
- Files < 500 lines; no secrets; typed public APIs; input validation at boundaries (image path exists + extension whitelist `jpg/jpeg/png/webp`; payload must parse as JSON).
- Refusal messages in the text pipeline keep the `CLAUDE_FLOW_EMBEDDING_MODEL` escape hatch (ADR-384 §2).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `plugins/swarmlo-bge-vl/.claude-plugin/plugin.json` | create | plugin manifest (metaharness-shaped) |
| `plugins/swarmlo-bge-vl/python/bge_vl_embed.py` | create | sidecar: health/self-test/embed/store/search/list/delete/purge; bge-vl.db + 768-dim guard; lazy torch |
| `plugins/swarmlo-bge-vl/python/requirements.txt` | create | venv deps (transformers/Pillow/numpy; torch installed separately with CPU index) |
| `plugins/swarmlo-bge-vl/scripts/_sidecar.mjs` | create | python resolution + spawn + degraded emitter (analog `_harness.mjs`) |
| `plugins/swarmlo-bge-vl/scripts/bge-vl.mjs` | create | CLI relay: embed/store/search/health/list/delete/purge/setup |
| `plugins/swarmlo-bge-vl/scripts/test-self.mjs` | create | plugin self-test drill (degraded path + stdlib health) |
| `v3/@claude-flow/cli/src/commands/bge-vl.ts` | create | core dispatcher (analog `commands/metaharness.ts`) |
| `v3/@claude-flow/cli/src/commands/index.ts` | modify | register `bge-vl` command |
| `v3/@claude-flow/cli/__tests__/bge-vl-command.test.ts` | create | vitest for dispatcher (mocked spawnSync/existsSync) |
| `v3/@claude-flow/cli/src/memory/embedding-models.ts` | modify | multimodal docstring → point at sidecar |
| `v3/@claude-flow/cli/src/memory/bge-embedder.ts` | modify | refusal message → add `bge-vl` pointer |
| `v3/@claude-flow/cli/src/memory/memory-initializer.ts` | modify | same pointer in `loadEmbeddingModel` refusal |
| `v3/@claude-flow/cli/__tests__/embedding-models.test.ts`, `__tests__/memory-initializer-hook.test.ts` | modify | assert new pointer text |
| `v3/@claude-flow/cli/src/commands/doctor.ts` | modify | add `checkBgeVlIntegration()` + register |
| `v3/@claude-flow/cli/__tests__/doctor.test.ts` (or existing doctor test file) | modify | warn-when-plugin-missing case |
| `v3/@claude-flow/cli/scripts/prepare-publish.mjs` | modify | mirror plugin into published package |
| `.github/workflows/no-bge-vl-smoke.yml` | create | CI removability gate |
| `v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md` | modify | revise to Accepted: sidecar pipeline |
| `embedding-models-2026-08-16.md` | modify | BGE-VL row + 结论 bullet |

---

### Task 0: Commit baseline registration + revise ADR-384 to the new direction

**Files:**
- Commit (no edit): `embedding-models-2026-08-16.md`, `v3/@claude-flow/cli/__tests__/embedding-models.test.ts`, `v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts`, `v3/@claude-flow/cli/src/memory/bge-embedder.ts`, `v3/@claude-flow/cli/src/memory/embedding-models.ts`, `v3/@claude-flow/cli/src/memory/memory-initializer.ts`
- Modify: `v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md`

**Interfaces:**
- Produces: a clean baseline commit `feat: register BGE-VL family with multimodal refusal (ADR-384)`; the revised ADR is the spec all later tasks argue from.

- [ ] **Step 1: Commit the prior session's registration work as-is**

```bash
git add embedding-models-2026-08-16.md v3/@claude-flow/cli/__tests__/embedding-models.test.ts v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts v3/@claude-flow/cli/src/memory/bge-embedder.ts v3/@claude-flow/cli/src/memory/embedding-models.ts v3/@claude-flow/cli/src/memory/memory-initializer.ts
git commit -m "feat: register BGE-VL family with multimodal refusal (ADR-384)"
```

- [ ] **Step 2: Revise ADR-384** — replace Status, Decision §2/§3, and Verification with:

```markdown
- **Status**: Accepted
- **Date**: 2026-08-19
- **Related**: ADR-382 (shared embedding-model registry + loader hook), ADR-383 (bge-reranker-v2-m3 default), ADR-150 (plugin removability)
- **Prompted by**: the user's request to configure BAAI's BGE-VL multimodal embedding family alongside the existing bge-m3 recall + v2-m3 rerank pair. 2026-08-19: direction superseded — registration-with-refusal becomes registration + a working Python-sidecar pipeline in a removable plugin.

## Decision

### 1. Register the BGE-VL family in the shared registry (unchanged)

[keep the existing §1 text verbatim]

### 2. Text-only loaders refuse, and route to the sidecar

- `loadEmbeddingModel` (memory-initializer.ts) returns `success:false` before the BGE branch, with an error naming the reason (no ONNX export; image input + remote code required), an escape hatch (`CLAUDE_FLOW_EMBEDDING_MODEL` → a text model), and a pointer to the working path: `npx swarmlo bge-vl embed`.
- `getBgeEmbedder` (bge-embedder.ts) returns `null` with the same reason + pointer — defense-in-depth for direct callers (the BEIR scripts can pass `BGE_MODEL=BAAI/bge-vl-*`).

### 3. Working pipeline: Python sidecar in a removable plugin

Three user decisions (2026-08-19), all binding:
1. **Runtime**: Python sidecar subprocess (transformers + `trust_remote_code`, one-shot JSON protocol, on-demand spawn; `-X utf8`). Heavy deps are imported lazily inside embed() only — health/self-test/store/search run on the stdlib, so the storage layer works without a venv.
2. **Storage isolation**: independent SQLite `bge-vl.db` (default `~/.swarmlo/bge-vl/bge-vl.db`, override `CLAUDE_FLOW_BGE_VL_DB`). A dim guard refuses any DB not stamped 768 — BGE-VL vectors must never touch memory.db's 1024-dim bge-m3 HNSW space. Retrieval is brute-force cosine + optional MMR rerank (dimension-agnostic; same math as core's cosineSim/mmrRerank).
3. **Structure**: metaharness template replication (ADR-150) — `plugins/swarmlo-bge-vl/` plugin dir (manifest + `.mjs` relay + Python sidecar), core `commands/bge-vl.ts` dispatcher, `prepare-publish.mjs` mirror, doctor component, CI removability gate `no-bge-vl-smoke.yml`. Missing Python/plugin degrades to `{degraded:true}` exit 0.

### 4. Out of scope

- ONNX export of BGE-VL and any JS image processor (no export exists upstream).
- Persistent sidecar daemon (each call pays model-load latency — acceptable v1).
- MCP tools, cross-encoder rerank integration, sparse, interactive model whitelists (`init` wizard / `embeddings models` keep excluding BGE-VL as a *loadable text* choice).

## Verification

- `tsc` build passes; vitest: `embedding-models.test.ts`, `memory-initializer-hook.test.ts` (refusal + pointer), `bge-vl-command.test.ts`, doctor test — green.
- Plugin self-tests: `python bge_vl_embed.py self-test` (stdlib-only storage drill + 768-dim guard) and `node plugins/swarmlo-bge-vl/scripts/test-self.mjs` (degraded drill) — green.
- CI `no-bge-vl-smoke.yml` green on PR.
- Manual (out of CI): `npx swarmlo bge-vl setup` → `embed --text` → 768-dim vector; `store` → `search` cosine 1.0 for identical text.
```

- [ ] **Step 3: Commit**

```bash
git add v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md
git commit -m "docs: revise ADR-384 to sidecar pipeline direction"
```

---

### Task 1: Plugin manifest + sidecar storage core (stdlib-only, self-test green)

**Files:**
- Create: `plugins/swarmlo-bge-vl/.claude-plugin/plugin.json`
- Create: `plugins/swarmlo-bge-vl/python/bge_vl_embed.py` (storage modes only; `embed` lands in Task 2)

**Interfaces:**
- Consumes: nothing.
- Produces: `open_db(path)`, `pack/unpack`, `cosine(a,b)`, `mmr_rerank(ranked, lam)`, modes `health|self-test|store|search|list|delete|purge`; JSON protocol `{ok:true,...}` on stdout, exit 0; errors `{ok:false,error}` exit 2. These exact names are consumed by Tasks 2–3.

- [ ] **Step 1: Write the plugin manifest**

`plugins/swarmlo-bge-vl/.claude-plugin/plugin.json`:

```json
{
  "name": "swarmlo-bge-vl",
  "description": "BGE-VL multimodal (vision-language) embeddings for swarmlo — Python sidecar over BAAI/bge-vl-* with an isolated 768-dim bge-vl.db (ADR-384). Removable per ADR-150: missing Python degrades to {degraded:true} exit 0.",
  "version": "0.1.0",
  "author": { "name": "ruvnet", "url": "https://github.com/ruvnet" },
  "homepage": "https://github.com/z451047442-debug/swarmlo",
  "license": "MIT",
  "keywords": ["swarmlo", "bge-vl", "multimodal", "embeddings", "vision-language", "python-sidecar", "adr-384", "adr-150", "optional-dependency", "graceful-degradation"]
}
```

- [ ] **Step 2: Write the sidecar (storage modes) so `self-test` passes**

`plugins/swarmlo-bge-vl/python/bge_vl_embed.py`:

```python
#!/usr/bin/env python3
"""BGE-VL multimodal embedding sidecar for swarmlo (ADR-384).

One-shot JSON protocol — invoked by
plugins/swarmlo-bge-vl/scripts/bge-vl.mjs, never run as a server.

LOAD-BEARING DESIGN RULES
  1. Heavy deps (torch / transformers / Pillow / numpy) are imported
     LAZILY inside embed() only. health / self-test / store / search /
     list / delete / purge run on the stdlib — so the storage layer and
     self-test work with no venv at all.
  2. The DB is a SEPARATE file from memory.db (default
     ~/.swarmlo/bge-vl/bge-vl.db, override CLAUDE_FLOW_BGE_VL_DB).
     768-dim vectors must never touch the 1024-dim bge-m3 HNSW space.
     open_db() refuses foreign-dimension DBs.
  3. Every mode prints ONE JSON object to stdout and exits 0 on success,
     2 on usage/storage error, 3 when model deps are missing (degraded).
"""
import argparse
import json
import math
import os
import sqlite3
import struct
import sys

DIM = 768
DEFAULT_DB = os.path.expanduser(
    os.environ.get('CLAUDE_FLOW_BGE_VL_DB', '~/.swarmlo/bge-vl/bge-vl.db')
)


def fail(message, code=2):
    print(json.dumps({'ok': False, 'error': message}))
    sys.exit(code)


def open_db(path):
    try:
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        con = sqlite3.connect(path)
        con.execute(
            'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)'
        )
        con.execute(
            """CREATE TABLE IF NOT EXISTS vectors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                kind TEXT NOT NULL DEFAULT 'text',
                payload TEXT NOT NULL DEFAULT '{}',
                vec BLOB NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        row = con.execute("SELECT v FROM meta WHERE k = 'dim'").fetchone()
        if row is None:
            con.execute('INSERT INTO meta (k, v) VALUES (?, ?)', ('dim', str(DIM)))
        elif int(row[0]) != DIM:
            con.close()
            fail(
                f'bge-vl.db dim={row[0]} != {DIM} — refusing to mix vector '
                f'spaces. Move or delete {path} and re-create.'
            )
        con.commit()
        return con
    except sqlite3.Error as e:
        fail(f'db error: {e}')


def pack(vec):
    return struct.pack(f'{len(vec)}f', *vec)


def unpack(blob):
    return list(struct.unpack(f'{len(blob) // 4}f', blob))


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


def mmr_rerank(ranked, lam):
    """ranked: [(cos_to_query, idx, vec)] -> [idx] in MMR order.
    lam = 1.0 -> pure cosine order (no diversity)."""
    if lam >= 1.0 or len(ranked) <= 1:
        return [r[1] for r in ranked]
    pool = [dict(cos=r[0], idx=r[1], vec=r[2]) for r in ranked]
    chosen = []
    while pool:
        best, best_score = None, float('-inf')
        for d in pool:
            div = max((cosine(d['vec'], s['vec']) for s in chosen), default=0.0)
            score = lam * d['cos'] - (1.0 - lam) * div
            if score > best_score:
                best_score, best = score, d
        chosen.append(best)
        pool.remove(best)
    return [d['idx'] for d in chosen]


# ------------------------------------------------------------ commands

def cmd_health(args):
    con = open_db(args.db)
    count = con.execute('SELECT COUNT(*) FROM vectors').fetchone()[0]
    con.close()
    print(json.dumps({'ok': True, 'dim': DIM, 'count': count, 'db': args.db}))


def cmd_store(args):
    vec = json.loads(args.vector)
    if len(vec) != DIM:
        fail(f'vector dim {len(vec)} != {DIM} — 768-dim BGE-VL space only')
    payload = args.payload or '{}'
    json.loads(payload)  # validate JSON
    con = open_db(args.db)
    con.execute(
        'INSERT OR REPLACE INTO vectors (key, kind, payload, vec) VALUES (?,?,?,?)',
        (args.key, args.kind, payload, pack(vec)),
    )
    con.commit()
    con.close()
    print(json.dumps({'ok': True, 'key': args.key, 'dim': DIM}))


def cmd_search(args):
    qvec = json.loads(args.vector)
    if len(qvec) != DIM:
        fail(f'query dim {len(qvec)} != {DIM}')
    con = open_db(args.db)
    rows = con.execute(
        'SELECT id, key, kind, payload, vec FROM vectors'
    ).fetchall()
    con.close()
    scored = []
    for (i, key, kind, payload, blob) in rows:
        v = unpack(blob)
        cos = cosine(qvec, v)
        if args.threshold is None or cos >= args.threshold:
            scored.append({'id': i, 'key': key, 'kind': kind,
                           'payload': payload, 'vec': v, 'cos': cos})
    scored.sort(key=lambda s: s['cos'], reverse=True)
    scored = scored[: args.top_k]
    order = mmr_rerank([(s['cos'], s['id'], s['vec']) for s in scored],
                       args.mmr_lambda)
    by_id = {s['id']: s for s in scored}
    hits = [
        {'id': i, 'key': by_id[i]['key'], 'kind': by_id[i]['kind'],
         'payload': by_id[i]['payload'], 'cosine': round(by_id[i]['cos'], 6)}
        for i in order
    ]
    print(json.dumps({'ok': True, 'hits': hits, 'dim': DIM}))


def cmd_list(args):
    con = open_db(args.db)
    rows = con.execute(
        'SELECT id, key, kind, payload, created_at FROM vectors '
        'ORDER BY id DESC LIMIT ?', (args.limit,)
    ).fetchall()
    con.close()
    items = [{'id': r[0], 'key': r[1], 'kind': r[2],
              'payload': r[3], 'created_at': r[4]} for r in rows]
    print(json.dumps({'ok': True, 'items': items, 'dim': DIM}))


def cmd_delete(args):
    con = open_db(args.db)
    cur = con.execute('DELETE FROM vectors WHERE key = ?', (args.key,))
    con.commit()
    con.close()
    print(json.dumps({'ok': True, 'deleted': cur.rowcount}))


def cmd_purge(args):
    con = open_db(args.db)
    con.execute('DELETE FROM vectors')
    con.commit()
    con.close()
    print(json.dumps({'ok': True, 'purged': True}))


def _expect_refusal(fn, label):
    # Suppress the refusal's error JSON — the one-JSON-object-per-stdout
    # contract must hold, or the relay's JSON.parse would break.
    import contextlib
    import io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        try:
            fn()
        except SystemExit as e:
            assert e.code == 2, f'{label}: expected exit 2, got {e.code}'
            return
    raise AssertionError(f'{label}: expected refusal, no SystemExit')


def cmd_self_test(args):
    con = open_db(args.db)
    con.execute('DELETE FROM vectors')  # clean slate
    a = [0.1] * 767 + [0.9]             # deterministic synthetic 768-dim
    b = [-0.1] * 767 + [-0.9]           # exact antiparallel (cos = -1.0)
    for key, vec in (('t-a', a), ('t-b', b)):
        con.execute(
            'INSERT INTO vectors (key, kind, payload, vec) VALUES (?,?,?,?)',
            (key, 'text', '{}', pack(vec)),
        )
    con.commit()
    con.close()
    assert abs(cosine(a, a) - 1.0) < 1e-6, 'cosine(a,a) != 1'
    assert cosine(a, b) < 0, 'cosine(a,b) >= 0'
    # dim guard: 767-dim store must be refused (exit 2)
    _expect_refusal(
        lambda: cmd_store(argparse.Namespace(
            db=args.db, key='bad', kind='text', payload='{}',
            vector=json.dumps([0.0] * 767))),
        '767-dim store',
    )
    print(json.dumps({'ok': True, 'self-test': 'pass', 'dim': DIM}))


def main():
    p = argparse.ArgumentParser(prog='bge_vl_embed.py')
    p.add_argument('mode', choices=['health', 'self-test', 'embed', 'store',
                                    'search', 'list', 'delete', 'purge'])
    p.add_argument('--db', default=DEFAULT_DB)
    p.add_argument('--json', action='store_true', help='JSON protocol (ignored; always on)')
    p.add_argument('--key')
    p.add_argument('--kind', default='text')
    p.add_argument('--vector')
    p.add_argument('--payload')
    p.add_argument('--threshold', type=float, default=None)
    p.add_argument('--top-k', type=int, default=10)
    p.add_argument('--mmr-lambda', type=float, default=1.0)
    p.add_argument('--limit', type=int, default=20)
    p.add_argument('--text')
    p.add_argument('--image')
    p.add_argument('--model')
    args = p.parse_args()
    if args.mode == 'health':
        cmd_health(args)
    elif args.mode == 'self-test':
        cmd_self_test(args)
    elif args.mode == 'store':
        cmd_store(args)
    elif args.mode == 'search':
        cmd_search(args)
    elif args.mode == 'list':
        cmd_list(args)
    elif args.mode == 'delete':
        cmd_delete(args)
    elif args.mode == 'purge':
        cmd_purge(args)
    elif args.mode == 'embed':
        fail('embed mode not implemented yet (Task 2)', 2)


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Run self-test, verify green**

Run: `python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-self-test.db`
Expected: `{"ok": true, "self-test": "pass", "dim": 768}`, exit 0.
Also run: `python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py health --db /tmp/bge-vl-self-test.db` → `"count": 2`.

- [ ] **Step 4: Commit**

```bash
git add plugins/swarmlo-bge-vl/.claude-plugin/plugin.json plugins/swarmlo-bge-vl/python/bge_vl_embed.py
git commit -m "feat: bge-vl plugin — stdlib-only storage sidecar with 768-dim guard"
```

---

### Task 2: Sidecar embed mode (lazy heavy deps) + requirements.txt

**Files:**
- Modify: `plugins/swarmlo-bge-vl/python/bge_vl_embed.py` (replace the `embed` stub in `main()` and add `cmd_embed`)
- Create: `plugins/swarmlo-bge-vl/python/requirements.txt`

**Interfaces:**
- Consumes: `DIM`, `fail` from Task 1.
- Produces: `cmd_embed(args)` → stdout `{"ok":true,"dim":768,"model":"<name>","vector":[...768 floats]}`; exit 3 + `{ok:false,error:"model deps missing (...)"}` when torch/transformers/PIL/numpy are not importable. Consumed by Task 3's relay.

- [ ] **Step 1: Write the failing degradation probe**

Run: `python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py embed --text "probe" --db /tmp/x.db`
Expected (with the Task-1 stub): exit 2 with `{"ok": false, "error": "embed mode not implemented yet (Task 2)"}` — this confirms the mode routes; the real contract arrives in Step 2.

- [ ] **Step 2: Add `cmd_embed` + `requirements.txt`**

In `bge_vl_embed.py`, add below `cmd_purge`:

```python
def cmd_embed(args):
    text = args.text or ''
    if not text and not args.image:
        fail('embed needs --text and/or --image')
    if args.image:
        if not os.path.isfile(args.image):
            fail(f'image not found: {args.image}')
        ext = os.path.splitext(args.image)[1].lower()
        if ext not in ('.jpg', '.jpeg', '.png', '.webp'):
            fail(f'unsupported image type {ext or "(none)"} — jpg/png/webp only')
    try:
        import numpy as np  # noqa: F401
        import torch  # noqa: F401
        from transformers import AutoModel  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        fail(
            f'model deps missing ({getattr(e, "name", e)}) — '
            f'run `npx swarmlo bge-vl setup`',
            3,
        )
    model_name = args.model or os.environ.get(
        'SWARMLO_BGE_VL_MODEL', 'BAAI/bge-vl-large'
    )
    try:
        model = AutoModel.from_pretrained(model_name, trust_remote_code=True)
        model.set_processor(model_name)
        model.eval()
        with torch.no_grad():
            if text and args.image:
                out = model.encode(
                    text=text, image=Image.open(args.image).convert('RGB')
                )
            elif args.image:
                out = model.encode(image=Image.open(args.image).convert('RGB'))
            else:
                out = model.encode(text=text)
        vec = out.detach().cpu().numpy().reshape(-1)
    except Exception as e:
        fail(f'embed failed: {e}')
    if vec.shape[0] != DIM:
        fail(f'{model_name} returned dim {vec.shape[0]}, expected {DIM}')
    norm = float(np.linalg.norm(vec)) or 1.0
    vec = (vec / norm).tolist()  # BGE-VL normalizes already; belt-and-braces
    print(json.dumps(
        {'ok': True, 'dim': DIM, 'model': model_name, 'vector': vec}
    ))
```

Replace the `elif args.mode == 'embed':` stub in `main()` with:

```python
    elif args.mode == 'embed':
        cmd_embed(args)
```

`plugins/swarmlo-bge-vl/python/requirements.txt` (torch is NOT here — `setup` installs it separately with the CPU index):

```
transformers>=4.46
Pillow>=10.0
numpy>=1.24
```

- [ ] **Step 3: Verify the degradation contract (no venv needed)**

Run: `python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py embed --text "probe"`
Expected on a machine without torch/transformers: exit 3, stdout `{"ok": false, "error": "model deps missing (...)"}`. If torch IS installed locally, this step instead loads the model (slow) — either outcome proves routing works; CI asserts the exit-3 shape via the relay in Task 3.

- [ ] **Step 4: Re-run self-test (regression) and commit**

Run: `python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-self-test.db` → still pass.

```bash
git add plugins/swarmlo-bge-vl/python/bge_vl_embed.py plugins/swarmlo-bge-vl/python/requirements.txt
git commit -m "feat: bge-vl sidecar embed mode with lazy torch imports"
```

---

### Task 3: JS bridge + relay + plugin self-test

**Files:**
- Create: `plugins/swarmlo-bge-vl/scripts/_sidecar.mjs`
- Create: `plugins/swarmlo-bge-vl/scripts/bge-vl.mjs`
- Create: `plugins/swarmlo-bge-vl/scripts/test-self.mjs`

**Interfaces:**
- Consumes: sidecar modes from Tasks 1–2 (exit codes 0/2/3).
- Produces: `resolvePython()` → `string|null`; `runSidecar(args, {timeoutMs})` → `{ok, degraded, reason, json, stderr, exitCode}`; `emitDegradedJsonAndExit(reason, fix)`; `PLUGIN_DIR`, `SIDECAR_PATH`. Consumed by Tasks 4–7.

- [ ] **Step 1: Write the bridge `_sidecar.mjs`**

```js
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
```

- [ ] **Step 2: Write the relay `bge-vl.mjs`**

```js
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
```

- [ ] **Step 3: Write the plugin self-test `test-self.mjs`**

```js
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
  const r = drill(['embed', '--text', 'x'], { SWARMLO_BGE_VL_PYTHON: '/nonexistent-python' });
  assert.strictEqual(r.status, 0, `degraded drill exit ${r.status}: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.degraded, true, `not degraded: ${r.stdout}`);
  assert.ok(
    j.reason === 'bge-vl-python-unavailable' || j.reason === 'bge-vl-model-deps-missing',
    `unexpected reason ${j.reason}`,
  );
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
```

- [ ] **Step 4: Run the self-tests, verify, commit**

Run:
```bash
node plugins/swarmlo-bge-vl/scripts/test-self.mjs
```
Expected: degraded drill passes; health drill passes (this machine has Python 3.12.0) or skips.

```bash
git add plugins/swarmlo-bge-vl/scripts/_sidecar.mjs plugins/swarmlo-bge-vl/scripts/bge-vl.mjs plugins/swarmlo-bge-vl/scripts/test-self.mjs
git commit -m "feat: bge-vl JS relay with graceful degradation (ADR-150 pattern)"
```

---

### Task 4: Core `bge-vl` command dispatcher + registration + vitest

**Files:**
- Create: `v3/@claude-flow/cli/src/commands/bge-vl.ts`
- Modify: `v3/@claude-flow/cli/src/commands/index.ts` (mirror metaharness registration at the sites around lines 84, 204, 264–288)
- Create: `v3/@claude-flow/cli/__tests__/bge-vl-command.test.ts`

**Interfaces:**
- Consumes: `plugins/swarmlo-bge-vl/scripts/bge-vl.mjs` (Task 3); `Command`/`CommandContext`/`CommandResult` from `../types.js`.
- Produces: `resolveBgeVlPluginDir(): string | null`; `bgeVlCommand: Command`. Consumed by Task 6 (doctor reuses the same walk-up strategy, not the function — doctor must stay mock-free).

- [ ] **Step 1: Write the failing test**

`v3/@claude-flow/cli/__tests__/bge-vl-command.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawnSyncMock = vi.fn();
vi.mock('child_process', () => ({ spawnSync: spawnSyncMock }));

const existsSyncMock = vi.fn();
vi.mock('fs', async (importOriginal) => {
  const mod = await importOriginal<typeof import('fs')>();
  return { ...mod, existsSync: existsSyncMock };
});

import { bgeVlCommand, resolveBgeVlPluginDir } from '../src/commands/bge-vl.js';

beforeEach(() => {
  spawnSyncMock.mockReset();
  existsSyncMock.mockReset();
});

describe('resolveBgeVlPluginDir', () => {
  it('finds the plugin dir when scripts/bge-vl.mjs exists', () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith('bge-vl.mjs'));
    const dir = resolveBgeVlPluginDir();
    expect(dir).toBeTruthy();
    expect(String(dir).includes('swarmlo-bge-vl')).toBe(true);
  });

  it('returns null when the plugin is missing', () => {
    existsSyncMock.mockReturnValue(false);
    expect(resolveBgeVlPluginDir()).toBeNull();
  });
});

describe('bgeVlCommand', () => {
  it('degrades (success:false + reason) when the plugin is missing', async () => {
    existsSyncMock.mockReturnValue(false);
    const result = await bgeVlCommand.action({
      args: ['embed', '--text', 'x'],
    } as never);
    expect(result.success).toBe(false);
    expect((result.data as { reason?: string }).reason).toBe('bge-vl-plugin-not-found');
  });

  it('spawns node on the plugin relay with passthrough args', async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith('bge-vl.mjs'));
    spawnSyncMock.mockReturnValue({ status: 0 });
    const result = await bgeVlCommand.action({
      args: ['search', '--text', 'bear'],
    } as never);
    expect(spawnSyncMock).toHaveBeenCalledOnce();
    const [cmd, args] = spawnSyncMock.mock.calls[0];
    expect(cmd).toBe('node');
    expect(String(args[0]).endsWith('bge-vl.mjs')).toBe(true);
    expect(args).toEqual(expect.arrayContaining(['search', '--text', 'bear']));
    expect(result.success).toBe(true);
  });

  it('passes through a non-zero exit code', async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith('bge-vl.mjs'));
    spawnSyncMock.mockReturnValue({ status: 2 });
    const result = await bgeVlCommand.action({ args: ['bogus'] } as never);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd v3/@claude-flow/cli && npx vitest run __tests__/bge-vl-command.test.ts`
Expected: FAIL — `Cannot find module '../src/commands/bge-vl.js'`.

- [ ] **Step 3: Implement the dispatcher**

`v3/@claude-flow/cli/src/commands/bge-vl.ts`:

```ts
/**
 * V3 CLI BGE-VL Command — ADR-384 multimodal pipeline entry point.
 *
 * Thin dispatcher that delegates each subcommand to
 * `plugins/swarmlo-bge-vl/scripts/bge-vl.mjs` via spawnSync — the exact
 * metaharness.ts pattern (ADR-150). The plugin script owns the Python
 * sidecar + graceful degradation; here we only resolve the plugin dir
 * and spawn node.
 *
 * SUBCOMMANDS
 *   embed | store | search | health | list | delete | purge | setup
 *
 * ADR-150 ARCHITECTURAL CONSTRAINT
 * --------------------------------
 * This file MUST NOT import or spawn python/torch/transformers directly.
 * The plugin relay handles all of that; a missing plugin or Python yields
 * {degraded:true} exit 0 from the relay, which we pass through verbatim.
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the swarmlo-bge-vl plugin dir with the same 3-strategy walk-up
 * used by doctor.ts (checkMetaharnessIntegration): module-relative walk
 * (npx/global installs), cwd walk (monorepo dev), explicit node_modules.
 */
export function resolveBgeVlPluginDir(): string | null {
  const candidates: string[] = [];
  try {
    let q = __dirname;
    for (let i = 0; i < 8; i++) {
      candidates.push(join(q, 'plugins', 'swarmlo-bge-vl'));
      q = dirname(q);
    }
  } catch {
    // import.meta.url unavailable under some bundlers — cwd walk covers it.
  }
  let p = process.cwd();
  for (let i = 0; i < 8; i++) {
    candidates.push(join(p, 'plugins', 'swarmlo-bge-vl'));
    p = dirname(p);
  }
  candidates.push(join(process.cwd(), 'node_modules', '@claude-flow', 'cli', 'plugins', 'swarmlo-bge-vl'));
  for (const c of candidates) {
    if (existsSync(join(c, 'scripts', 'bge-vl.mjs'))) return c;
  }
  return null;
}

export const bgeVlCommand: Command = {
  name: 'bge-vl',
  description:
    'BGE-VL multimodal embeddings (ADR-384) — embed / store / search via the Python sidecar plugin with graceful degradation.',
  options: [
    {
      name: 'subcommand',
      description: 'One of: embed | store | search | health | list | delete | purge | setup',
      type: 'string' as const,
    },
  ],
  async action(context: CommandContext): Promise<CommandResult> {
    const args = (context as { args?: string[] }).args || [];
    const pluginDir = resolveBgeVlPluginDir();
    if (!pluginDir) {
      return {
        success: false,
        exitCode: 2,
        data: {
          degraded: true,
          reason: 'bge-vl-plugin-not-found',
          fix: 'the swarmlo-bge-vl plugin ships with @claude-flow/cli — reinstall if missing',
        },
      };
    }
    const scriptPath = join(pluginDir, 'scripts', 'bge-vl.mjs');
    const r = spawnSync('node', [scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env,
      timeout: 5 * 60 * 1000,
    });
    return {
      success: (r.status ?? 0) === 0,
      exitCode: r.status ?? 1,
      data: { scriptPath, args },
    };
  },
};
```

- [ ] **Step 4: Register in `commands/index.ts`**

Mirror the metaharness registration exactly:
- Add to the command map near line 84: `  'bge-vl': () => import('./bge-vl.js'),`
- Add the getter near line 204: `export async function getBgeVlCommand() { return loadCommand('bge-vl'); }`
- Add `bgeVlCmd` to the `loadCommand('...')` list and the aggregated lists near lines 264–288 (copy the metaharness entries `metaharnessCmd` and add `bgeVlCmd` beside each).

- [ ] **Step 5: Run the test + tsc build**

Run:
```bash
cd v3/@claude-flow/cli && npx vitest run __tests__/bge-vl-command.test.ts && pnpm -r build
```
Expected: 4 tests PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add v3/@claude-flow/cli/src/commands/bge-vl.ts v3/@claude-flow/cli/src/commands/index.ts v3/@claude-flow/cli/__tests__/bge-vl-command.test.ts
git commit -m "feat: bge-vl core command dispatcher over the plugin relay (ADR-384)"
```

---

### Task 5: Refusal messages route to the sidecar

**Files:**
- Modify: `v3/@claude-flow/cli/src/memory/embedding-models.ts` (multimodal docstring)
- Modify: `v3/@claude-flow/cli/src/memory/bge-embedder.ts` (refusal string)
- Modify: `v3/@claude-flow/cli/src/memory/memory-initializer.ts` (refusal string in `loadEmbeddingModel`)
- Modify: `v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts` (assert the pointer)

**Interfaces:**
- Consumes: ADR-384 §2 wording (Task 0).
- Produces: text-pipeline refusal errors now contain `bge-vl`; consumed by no code, asserted by tests.

- [ ] **Step 1: Update the test first (failing)**

In `v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts`, in the existing BGE-VL refusal test, keep the current assertions (`/multimodal \(vision-language\)/` and `CLAUDE_FLOW_EMBEDDING_MODEL`) and add:

```ts
      expect(String(error)).toMatch(/npx swarmlo bge-vl/);
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd v3/@claude-flow/cli && npx vitest run __tests__/memory-initializer-hook.test.ts`
Expected: FAIL — error does not contain `npx swarmlo bge-vl`.

- [ ] **Step 3: Update the three source files**

`embedding-models.ts` — append to the `multimodal?` docstring (keep the existing sentences):

```ts
   * The working pipeline lives in the swarmlo-bge-vl plugin (Python
   * sidecar, isolated bge-vl.db) — see ADR-384. Loaders refuse with a
   * pointer to `npx swarmlo bge-vl embed`.
```

`bge-embedder.ts` — replace the refusal string with:

```ts
    if (spec.multimodal) {
      state.error =
        `${modelName} is a multimodal (vision-language) model — the text-only ` +
        'ONNX pipeline cannot load it (no ONNX export; requires image input + remote code). ' +
        'Use the BGE-VL sidecar instead: `npx swarmlo bge-vl embed --text "..."` (ADR-384).';
      return null;
    }
```

`memory-initializer.ts` — locate the `multimodal` refusal inside `loadEmbeddingModel` (the block returning `success:false` that mentions `CLAUDE_FLOW_EMBEDDING_MODEL`). Read it first, keep every existing sentence, and append:

```ts
    ' Use the BGE-VL sidecar instead: `npx swarmlo bge-vl embed --text "..."` (ADR-384).';
```

- [ ] **Step 4: Run the tests, verify green**

Run: `cd v3/@claude-flow/cli && npx vitest run __tests__/memory-initializer-hook.test.ts __tests__/embedding-models.test.ts`
Expected: all PASS (registry tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add v3/@claude-flow/cli/src/memory/embedding-models.ts v3/@claude-flow/cli/src/memory/bge-embedder.ts v3/@claude-flow/cli/src/memory/memory-initializer.ts v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts
git commit -m "feat: route BGE-VL refusal messages to the sidecar pipeline"
```

---

### Task 6: Doctor component `checkBgeVlIntegration`

**Files:**
- Modify: `v3/@claude-flow/cli/src/commands/doctor.ts` (add the check function + register it beside `checkMetaharnessIntegration`'s call site)
- Modify: the doctor test file that already covers `checkMetaharnessIntegration` (grep `__tests__/doctor*.test.ts` for it; create the case in whichever file has it)

**Interfaces:**
- Consumes: `HealthCheck` type (existing); plugin layout from Task 1/3.
- Produces: `checkBgeVlIntegration(): Promise<HealthCheck>` — `warn` when plugin absent (optional posture, same as metaharness), `pass` when files + python present, `warn` when python missing with fix hint `npx swarmlo bge-vl setup`.

- [ ] **Step 1: Find the registration site and the existing doctor test pattern**

```bash
grep -n "checkMetaharnessIntegration" v3/@claude-flow/cli/src/commands/doctor.ts
grep -rn "checkMetaharnessIntegration" v3/@claude-flow/cli/__tests__/ | head -5
```

- [ ] **Step 2: Write the failing test in the identified doctor test file**

Mirror the existing metaharness case's mock style (mock `fs.existsSync` + `child_process.spawnSync` if that's what it uses; otherwise import the real function and mock only `existsSync`):

```ts
  it('checkBgeVlIntegration warns when the plugin is absent', async () => {
    existsSyncMock.mockReturnValue(false);
    const check = await checkBgeVlIntegration();
    expect(check.status).toBe('warn');
    expect(check.message).toMatch(/swarmlo-bge-vl/);
    expect(check.fix).toMatch(/bge-vl setup/);
  });
```

Run: `cd v3/@claude-flow/cli && npx vitest run <that test file>`
Expected: FAIL — `checkBgeVlIntegration is not defined`.

- [ ] **Step 3: Implement in `doctor.ts`**

Add after `checkMetaharnessIntegration`'s closing brace:

```ts
async function checkBgeVlIntegration(): Promise<HealthCheck> {
  // ADR-384 — surface BGE-VL sidecar availability in `doctor`. Same
  // 3-strategy plugin-dir walk-up as checkMetaharnessIntegration; the
  // plugin is an optional augmentation, so absence is WARN not FAIL.
  const candidates: string[] = [];
  try {
    const selfDir = dirname(fileURLToPath(import.meta.url));
    let q = selfDir;
    for (let i = 0; i < 8; i++) {
      candidates.push(join(q, 'plugins', 'swarmlo-bge-vl'));
      q = dirname(q);
    }
  } catch {
    // fall through to cwd walk
  }
  let p = process.cwd();
  for (let i = 0; i < 8; i++) {
    candidates.push(join(p, 'plugins', 'swarmlo-bge-vl'));
    p = dirname(p);
  }
  candidates.push(join(process.cwd(), 'node_modules', '@claude-flow', 'cli', 'plugins', 'swarmlo-bge-vl'));

  let pluginDir: string | null = null;
  for (const c of candidates) {
    if (existsSync(join(c, 'scripts', 'bge-vl.mjs'))) {
      pluginDir = c;
      break;
    }
  }
  if (!pluginDir) {
    return {
      name: 'BGE-VL plugin (ADR-384)',
      status: 'warn',
      message: 'plugins/swarmlo-bge-vl/ not found — BGE-VL multimodal embeddings will degrade gracefully',
      fix: 'Optional: `npx swarmlo bge-vl setup` after reinstalling the CLI package',
    };
  }
  const required = [
    'scripts/bge-vl.mjs',
    'scripts/_sidecar.mjs',
    'python/bge_vl_embed.py',
    'python/requirements.txt',
    '.claude-plugin/plugin.json',
  ];
  const missing = required.filter((f) => !existsSync(join(pluginDir, f)));
  if (missing.length > 0) {
    return {
      name: 'BGE-VL plugin (ADR-384)',
      status: 'warn',
      message: `plugin incomplete — missing: ${missing.join(', ')}`,
      fix: 'Reinstall the CLI package or restore plugins/swarmlo-bge-vl/ from the repo',
    };
  }
  const probe = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['-c', 'print(1)'],
    { timeout: 10_000 },
  );
  if (probe.status !== 0) {
    return {
      name: 'BGE-VL plugin (ADR-384)',
      status: 'warn',
      message: 'plugin present but no python on PATH — embed/search will degrade',
      fix: 'Install Python 3.10+ and run `npx swarmlo bge-vl setup`',
    };
  }
  return {
    name: 'BGE-VL plugin (ADR-384)',
    status: 'pass',
    message: `plugin + python found at ${pluginDir}`,
  };
}
```

Then register: in the doctor health-check list where `checkMetaharnessIntegration()` is awaited, add `checkBgeVlIntegration()` beside it (same Promise.all or sequential await pattern the file uses — read the call site and match it).

- [ ] **Step 4: Run the doctor test + build**

Run: `cd v3/@claude-flow/cli && npx vitest run <doctor test file> && pnpm -r build`
Expected: new case PASS; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add v3/@claude-flow/cli/src/commands/doctor.ts v3/@claude-flow/cli/__tests__/<doctor test file>
git commit -m "feat: doctor component for BGE-VL sidecar availability"
```

---

### Task 7: Publish mirror + CI removability gate

**Files:**
- Modify: `v3/@claude-flow/cli/scripts/prepare-publish.mjs` (mirror the plugin)
- Create: `.github/workflows/no-bge-vl-smoke.yml`

**Interfaces:**
- Consumes: plugin layout (Tasks 1–3), relay/test-self (Task 3).
- Produces: published `@claude-flow/cli` package contains `plugins/swarmlo-bge-vl/`; CI enforces removability.

- [ ] **Step 1: Add the mirror in `prepare-publish.mjs`**

Read the metaharness mirror block (around lines 35–40, `await cp(join(repoRoot, 'plugins', 'swarmlo-metaharness'), join(pluginsDir, 'swarmlo-metaharness'), { recursive: true })`). Add immediately after it:

```js
await cp(
  join(repoRoot, 'plugins', 'swarmlo-bge-vl'),
  join(pluginsDir, 'swarmlo-bge-vl'),
  { recursive: true },
);
```

- [ ] **Step 2: Write the CI workflow**

`.github/workflows/no-bge-vl-smoke.yml`:

```yaml
# ADR-384 removability gate, modeled on no-metaharness-smoke.yml (ADR-150).
#
#   "Swarmlo remains operational if the BGE-VL plugin or Python is removed."
#
# 1. STATIC: no torch/transformers/Pillow/numpy may appear in non-optional
#    dependencies of any package.json — python deps live only in the
#    plugin-side venv (installed by `bge-vl setup`).
# 2. STRUCTURE: the plugin manifest parses and all required files exist.
# 3. SIDECAR: stdlib-only self-test runs under CI's python3 (no venv, no
#    model download) — proves the storage layer + 768-dim guard.
# 4. DEGRADED: with python forced missing, the relay must exit 0 and emit
#    {degraded:true} — ADR-150 rule #3.
name: no-bge-vl-smoke

on:
  push:
    branches: [main]
    paths:
      - 'plugins/**'
      - 'scripts/**'
      - '**/package.json'
      - '**/package-lock.json'
      - '.github/workflows/no-bge-vl-smoke.yml'
  pull_request:
    paths:
      - 'plugins/**'
      - 'scripts/**'
      - '**/package.json'
      - '**/package-lock.json'
      - '.github/workflows/no-bge-vl-smoke.yml'
  workflow_dispatch:

jobs:
  smoke-without-python-deps:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Static — no python ML deps in non-optional dependencies
        run: |
          node -e "
            const { readFileSync, readdirSync, statSync } = require('fs');
            const { join } = require('path');
            const candidates = ['package.json', 'swarmlo/package.json', 'v3/@claude-flow/cli/package.json'];
            try {
              for (const p of readdirSync('plugins')) {
                const pj = join('plugins', p, 'package.json');
                try { statSync(pj); candidates.push(pj); } catch {}
              }
            } catch {}
            const offenders = [];
            for (const c of candidates) {
              let json;
              try { json = JSON.parse(readFileSync(c, 'utf-8')); } catch { continue; }
              for (const dep of Object.keys(json.dependencies || {})) {
                if (/^(torch|transformers|Pillow|numpy)$/.test(dep)) offenders.push({ file: c, dep });
              }
            }
            if (offenders.length) {
              console.error('ADR-384 removability violated:');
              for (const o of offenders) console.error('  ' + o.file + ' → ' + o.dep + ' in dependencies');
              process.exit(1);
            }
            console.log('✓ No python ML deps in non-optional dependencies anywhere.');
          "

      - name: Structure — plugin manifest + required files
        run: |
          node -e "
            const { readFileSync, existsSync } = require('fs');
            const pj = JSON.parse(readFileSync('plugins/swarmlo-bge-vl/.claude-plugin/plugin.json', 'utf-8'));
            if (pj.name !== 'swarmlo-bge-vl') throw new Error('manifest name mismatch');
            for (const f of [
              'plugins/swarmlo-bge-vl/scripts/bge-vl.mjs',
              'plugins/swarmlo-bge-vl/scripts/_sidecar.mjs',
              'plugins/swarmlo-bge-vl/scripts/test-self.mjs',
              'plugins/swarmlo-bge-vl/python/bge_vl_embed.py',
              'plugins/swarmlo-bge-vl/python/requirements.txt',
            ]) {
              if (!existsSync(f)) throw new Error('missing ' + f);
            }
            console.log('✓ Plugin structure intact.');
          "

      - name: Sidecar — stdlib-only self-test (no venv, no model)
        run: |
          python3 -m py_compile plugins/swarmlo-bge-vl/python/bge_vl_embed.py
          DB=$(mktemp -d)/bge-vl-ci.db
          python3 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db "$DB"
          python3 plugins/swarmlo-bge-vl/python/bge_vl_embed.py health --db "$DB" | grep -q '"dim": 768'
          echo "✓ Sidecar self-test green (768-dim guard exercised)."

      - name: Relay — self-test drill
        run: node plugins/swarmlo-bge-vl/scripts/test-self.mjs

      - name: Degraded — python forced missing must exit 0 + degraded:true
        run: |
          OUT=$(SWARMLO_BGE_VL_PYTHON=/nonexistent-python node plugins/swarmlo-bge-vl/scripts/bge-vl.mjs embed --text x 2>&1)
          STATUS=$?
          echo "$OUT" | head -10
          echo "exit: $STATUS"
          if [ "$STATUS" != "0" ]; then
            echo "FAIL: relay exited $STATUS but graceful degradation requires 0"
            exit 1
          fi
          if ! echo "$OUT" | grep -q '"degraded": true'; then
            echo "FAIL: relay did not emit degraded:true"
            exit 1
          fi
          echo "✓ Relay degraded gracefully when python was unreachable."
```

- [ ] **Step 3: Verify the steps locally (what CI will run)**

```bash
python -X utf8 -m py_compile plugins/swarmlo-bge-vl/python/bge_vl_embed.py
python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-ci.db
node plugins/swarmlo-bge-vl/scripts/test-self.mjs
SWARMLO_BGE_VL_PYTHON=/nonexistent-python node plugins/swarmlo-bge-vl/scripts/bge-vl.mjs embed --text x; echo "exit=$?"
```
Expected: all green; degraded drill exit 0 with `"degraded": true`.

- [ ] **Step 4: Commit**

```bash
git add v3/@claude-flow/cli/scripts/prepare-publish.mjs .github/workflows/no-bge-vl-smoke.yml
git commit -m "ci: BGE-VL removability gate + publish mirror (ADR-384)"
```

---

### Task 8: Docs finalize + full verification

**Files:**
- Modify: `v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md` (Verification section → measured results)
- Modify: `embedding-models-2026-08-16.md` (BGE-VL table row + 快速结论 bullet)

**Interfaces:**
- Consumes: everything above.
- Produces: spec/doc truth matches the shipped code.

- [ ] **Step 1: Update `embedding-models-2026-08-16.md`**

Replace the BGE-VL table row (section 一) with:

```markdown
| `BAAI/bge-vl-base` / `BAAI/bge-vl-large` | 768 | **2026-08-19 接入**：CLIP 风格多模态（视觉-语言）。文本 ONNX 管线仍拒绝加载并指向 sidecar；**工作管线在 `plugins/swarmlo-bge-vl/`**——Python sidecar（transformers + trust_remote_code）+ 独立 `bge-vl.db`（768 维守卫，绝不进 memory.db 的 1024 维 HNSW）。命令：`npx swarmlo bge-vl embed|store|search|setup`；缺 Python 优雅降级 | `v3/@claude-flow/cli/src/commands/bge-vl.ts`、`plugins/swarmlo-bge-vl/` |
```

Replace the 快速结论 BGE-VL bullet with:

```markdown
- **BGE-VL（2026-08-19 工作管线）**：注册表保持 `bge-vl-base`/`bge-vl-large`（`multimodal: true`）；文本管线加载失败时给出 sidecar 指引。真正的图文嵌入走 `npx swarmlo bge-vl setup`（venv：torch CPU + transformers）→ `bge-vl embed --text/--image` → `bge-vl store/search`（独立 `~/.swarmlo/bge-vl/bge-vl.db`，768 维专属，维度守卫拒绝混库）。`CLAUDE_FLOW_HF_ENDPOINT` 镜像透传；模型默认 `BAAI/bge-vl-large`（`SWARMLO_BGE_VL_MODEL` 可换）。
```

- [ ] **Step 2: Update ADR-384 Verification section** to the actual results (fill in exact pass counts after running Step 3).

- [ ] **Step 3: Full verification**

```bash
cd v3/@claude-flow/cli && pnpm -r build
cd v3/@claude-flow/cli && npx vitest run __tests__/bge-vl-command.test.ts __tests__/memory-initializer-hook.test.ts __tests__/embedding-models.test.ts
node plugins/swarmlo-bge-vl/scripts/test-self.mjs
python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-final.db
```

Expected: tsc exit 0; all vitest files green; both self-tests green.

- [ ] **Step 4: Commit**

```bash
git add v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md embedding-models-2026-08-16.md
git commit -m "docs: finalize ADR-384 verification + embedding-model inventory"
```

---

## Execution Notes

- Windows dev box: `python` resolves to 3.12.0; venv bootstrap via `npx swarmlo bge-vl setup` uses the CPU torch index (~200MB vs 2.5GB CUDA). Model download (~1.6GB for bge-vl-large) is one-time via HF cache, mirror-able with `CLAUDE_FLOW_HF_ENDPOINT=https://hf-mirror.com`.
- Manual end-to-end (after Task 3, optional): `setup` → `embed --text "a bear"` (expect 768 floats) → `store --key bear --text "a bear"` → `search --text "a bear"` (top hit cosine ≈ 1.0).
- The plan intentionally reuses core's cosineSim/mmrRerank *semantics* inside the sidecar (same math where the vectors live); importing the TS utilities from the plugin relay would break the published-package layout, so the relay stays dependency-free like the metaharness skills.
