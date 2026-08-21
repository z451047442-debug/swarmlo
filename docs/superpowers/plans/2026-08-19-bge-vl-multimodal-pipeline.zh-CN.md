# BGE-VL 多模态管线实施计划

> 本文由原英文计划（`2026-08-19-bge-vl-multimodal-pipeline.md`，已删除，见 git 提交 1248b71）中文化而来。代码块、命令与文件路径保持原样（与仓库实现一一对应），正文与说明均已中文化。

> **面向 agentic worker：** 必需子技能：请使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐项执行本计划。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 把 BGE-VL 从「已注册但拒绝加载」（ADR-384 草案）变成一条可工作的多模态嵌入管线：一个原生运行 BAAI/bge-vl-* 的 Python 3.12 Sidecar，其 768 维向量隔离在专属的 `bge-vl.db` 中（绝不进入 memory.db 里 1024 维 bge-m3 的 HNSW 空间），以 metaharness 风格插件 `plugins/swarmlo-bge-vl/` 的形式发布，并配齐核心 dispatcher + doctor 检查 + CI 可移除性门禁。

**架构：** 三项由用户拍板的方向决策（2026-08-19）：
1. **运行时** —— Python Sidecar 子进程（transformers + `trust_remote_code`，一次性 JSON 协议，按需拉起）。重依赖采用惰性导入，因此 storage/health/self-test 仅靠标准库即可运行。
2. **存储** —— 独立的 SQLite 文件 `bge-vl.db`（标准库 `sqlite3`），由 Sidecar 独占；维度守卫拒绝任何非 768 维的数据库。检索 = 暴力余弦 + MMR 重排（与维度无关的数学运算，与核心的 cosineSim/mmrRerank 语义一致）。
3. **结构** —— 完全复刻 metaharness 模板（ADR-150）：插件目录 + 核心 `bge-vl.ts` dispatcher + `prepare-publish.mjs` 镜像 + doctor 组件 + CI 可移除性门禁。纯文本 ONNX 管线继续拒绝 BGE-VL，但其报错现在会引导用户使用 Sidecar。

**技术栈：** Python 3.12（sqlite3/argparse/json 标准库；惰性导入 torch+transformers+Pillow+numpy），Node 20+（ESM .mjs，spawnSync），TypeScript（vitest）用于核心 dispatcher/doctor，GitHub Actions 用于 CI 门禁。

**规格：** `v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md` —— Task 0 将其修订为新方向；执行者先阅读修订版。

## 全局约束

- BGE-VL 向量为 768 维，且只存在于 `bge-vl.db`（默认 `~/.swarmlo/bge-vl/bge-vl.db`，可用 `CLAUDE_FLOW_BGE_VL_DB` 覆盖）。绝不写入 memory.db 及其 `vector_indexes`（该 HNSW 空间属于 1024 维 bge-m3）。
- 可移除性（ADR-150 规则 #1）：删除 `plugins/swarmlo-bge-vl/` 或卸载 Python 后 swarmlo 必须仍然可用。每条 bge-vl 路径都以 exit 0 降级为 `{degraded:true}` JSON —— 绝不抛异常。
- `torch`/`transformers`/`Pillow`/`numpy` 不得出现在任何 package.json 的 `dependencies` 里（它们只存在于插件侧 venv，由 `bge-vl setup` 安装）。
- Sidecar 的重依赖采用惰性导入 —— `health`/`self-test`/`store`/`search`/`list`/`delete`/`purge` 仅用标准库即可运行（CI 在无 venv 环境下测试）。
- TypeScript 采用 TDD London School；所有测试离线（CI 不下载模型；真实 embed 仅手工验证）。
- Node 20+，Python 3.10+（用户环境：3.12.0），Windows + POSIX。spawn 始终带 `-X utf8`（Windows UTF-8 输出）。
- 文件 <500 行；无 secrets；公共 API 类型化；边界输入校验（图片路径存在 + 扩展名白名单 `jpg/jpeg/png/webp`；payload 必须能解析为 JSON）。
- 文本管线的拒绝消息保留 `CLAUDE_FLOW_EMBEDDING_MODEL` 逃生舱（ADR-384 §2）。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `plugins/swarmlo-bge-vl/.claude-plugin/plugin.json` | 新建 | 插件清单（metaharness 形态） |
| `plugins/swarmlo-bge-vl/python/bge_vl_embed.py` | 新建 | sidecar：health/self-test/embed/store/search/list/delete/purge；bge-vl.db + 768 维守卫；惰性 torch |
| `plugins/swarmlo-bge-vl/python/requirements.txt` | 新建 | venv 依赖（transformers/Pillow/numpy；torch 单独用 CPU 索引安装） |
| `plugins/swarmlo-bge-vl/scripts/_sidecar.mjs` | 新建 | python 解析 + spawn + 降级发射器（对应 `_harness.mjs`） |
| `plugins/swarmlo-bge-vl/scripts/bge-vl.mjs` | 新建 | CLI 中继：embed/store/search/health/list/delete/purge/setup |
| `plugins/swarmlo-bge-vl/scripts/test-self.mjs` | 新建 | 插件自测演练（降级路径 + 纯标准库 health） |
| `v3/@claude-flow/cli/src/commands/bge-vl.ts` | 新建 | 核心 dispatcher（对应 `commands/metaharness.ts`） |
| `v3/@claude-flow/cli/src/commands/index.ts` | 修改 | 注册 `bge-vl` 命令 |
| `v3/@claude-flow/cli/__tests__/bge-vl-command.test.ts` | 新建 | dispatcher 的 vitest（mock spawnSync/existsSync） |
| `v3/@claude-flow/cli/src/memory/embedding-models.ts` | 修改 | 多模态 docstring → 指向 sidecar |
| `v3/@claude-flow/cli/src/memory/bge-embedder.ts` | 修改 | 拒绝消息 → 增加 `bge-vl` 指引 |
| `v3/@claude-flow/cli/src/memory/memory-initializer.ts` | 修改 | `loadEmbeddingModel` 拒绝消息同样加指引 |
| `v3/@claude-flow/cli/__tests__/embedding-models.test.ts`、`__tests__/memory-initializer-hook.test.ts` | 修改 | 断言新指引文案 |
| `v3/@claude-flow/cli/src/commands/doctor.ts` | 修改 | 新增 `checkBgeVlIntegration()` + 注册 |
| `v3/@claude-flow/cli/__tests__/doctor.test.ts`（或现有 doctor 测试文件） | 修改 | 插件缺失时 warn 的用例 |
| `v3/@claude-flow/cli/scripts/prepare-publish.mjs` | 修改 | 将插件镜像进发布包 |
| `.github/workflows/no-bge-vl-smoke.yml` | 新建 | CI 可移除性门禁 |
| `v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md` | 修改 | 修订为 Accepted：sidecar 管线 |
| `embedding-models-2026-08-16.md` | 修改 | BGE-VL 行 + 结论 bullet |

---

### Task 0：提交基线注册 + 将 ADR-384 修订为新方向

**文件：**
- 提交（不改动）：`embedding-models-2026-08-16.md`、`v3/@claude-flow/cli/__tests__/embedding-models.test.ts`、`v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts`、`v3/@claude-flow/cli/src/memory/bge-embedder.ts`、`v3/@claude-flow/cli/src/memory/embedding-models.ts`、`v3/@claude-flow/cli/src/memory/memory-initializer.ts`
- 修改：`v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md`

**接口：**
- 产出：干净的基线提交 `feat: register BGE-VL family with multimodal refusal (ADR-384)`；修订后的 ADR 是后续所有任务立论的规格。

- [ ] **步骤 1：将上一会话的注册工作原样提交**

```bash
git add embedding-models-2026-08-16.md v3/@claude-flow/cli/__tests__/embedding-models.test.ts v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts v3/@claude-flow/cli/src/memory/bge-embedder.ts v3/@claude-flow/cli/src/memory/embedding-models.ts v3/@claude-flow/cli/src/memory/memory-initializer.ts
git commit -m "feat: register BGE-VL family with multimodal refusal (ADR-384)"
```

- [ ] **步骤 2：修订 ADR-384** —— 将 Status、Decision §2/§3 与 Verification 替换为：

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

- [ ] **步骤 3：提交**

```bash
git add v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md
git commit -m "docs: revise ADR-384 to sidecar pipeline direction"
```

---

### Task 1：插件清单 + sidecar 存储核心（仅标准库，self-test 通过）

**文件：**
- 新建：`plugins/swarmlo-bge-vl/.claude-plugin/plugin.json`
- 新建：`plugins/swarmlo-bge-vl/python/bge_vl_embed.py`（仅存储模式；`embed` 在 Task 2 落地）

**接口：**
- 消费：无。
- 产出：`open_db(path)`、`pack/unpack`、`cosine(a,b)`、`mmr_rerank(ranked, lam)`、模式 `health|self-test|store|search|list|delete|purge`；stdout 输出 JSON 协议 `{ok:true,...}`，exit 0；错误 `{ok:false,error}` exit 2。这些确切名称被 Task 2–3 消费。

- [ ] **步骤 1：编写插件清单**

`plugins/swarmlo-bge-vl/.claude-plugin/plugin.json`：

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

- [ ] **步骤 2：编写 sidecar（存储模式）使 `self-test` 通过**

`plugins/swarmlo-bge-vl/python/bge_vl_embed.py`：

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

- [ ] **步骤 3：运行 self-test，确认通过**

运行：`python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-self-test.db`
预期：`{"ok": true, "self-test": "pass", "dim": 768}`，exit 0。
再运行：`python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py health --db /tmp/bge-vl-self-test.db` → `"count": 2`。

- [ ] **步骤 4：提交**

```bash
git add plugins/swarmlo-bge-vl/.claude-plugin/plugin.json plugins/swarmlo-bge-vl/python/bge_vl_embed.py
git commit -m "feat: bge-vl plugin — stdlib-only storage sidecar with 768-dim guard"
```

---

### Task 2：Sidecar embed 模式（惰性重依赖）+ requirements.txt

**文件：**
- 修改：`plugins/swarmlo-bge-vl/python/bge_vl_embed.py`（替换 `main()` 中的 `embed` 桩并新增 `cmd_embed`）
- 新建：`plugins/swarmlo-bge-vl/python/requirements.txt`

**接口：**
- 消费：Task 1 的 `DIM`、`fail`。
- 产出：`cmd_embed(args)` → stdout `{"ok":true,"dim":768,"model":"<name>","vector":[...768 floats]}`；当 torch/transformers/PIL/numpy 不可导入时 exit 3 + `{ok:false,error:"model deps missing (...)"}`。被 Task 3 的中继消费。

- [ ] **步骤 1：写出会失败的降级探针**

运行：`python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py embed --text "probe" --db /tmp/x.db`
预期（使用 Task 1 的桩）：exit 2 且输出 `{"ok": false, "error": "embed mode not implemented yet (Task 2)"}` —— 这确认了模式路由正常；真正的契约在步骤 2 落地。

- [ ] **步骤 2：新增 `cmd_embed` + `requirements.txt`**

在 `bge_vl_embed.py` 中，于 `cmd_purge` 之后添加：

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

将 `main()` 中的 `elif args.mode == 'embed':` 桩替换为：

```python
    elif args.mode == 'embed':
        cmd_embed(args)
```

`plugins/swarmlo-bge-vl/python/requirements.txt`（torch 不在此处 —— `setup` 会用 CPU 索引单独安装）：

```
transformers>=4.46
Pillow>=10.0
numpy>=1.24
```

- [ ] **步骤 3：验证降级契约（无需 venv）**

运行：`python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py embed --text "probe"`
预期：在没有 torch/transformers 的机器上，exit 3，stdout `{"ok": false, "error": "model deps missing (...)"}`。若本机已安装 torch，此步骤会转而加载模型（较慢）——两种结果都证明路由正常；CI 在 Task 3 通过中继断言 exit-3 的形态。

- [ ] **步骤 4：重跑 self-test（回归）并提交**

运行：`python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-self-test.db` → 仍应通过。

```bash
git add plugins/swarmlo-bge-vl/python/bge_vl_embed.py plugins/swarmlo-bge-vl/python/requirements.txt
git commit -m "feat: bge-vl sidecar embed mode with lazy torch imports"
```

---

### Task 3：JS 桥接 + 中继 + 插件自测

**文件：**
- 新建：`plugins/swarmlo-bge-vl/scripts/_sidecar.mjs`
- 新建：`plugins/swarmlo-bge-vl/scripts/bge-vl.mjs`
- 新建：`plugins/swarmlo-bge-vl/scripts/test-self.mjs`

**接口：**
- 消费：Task 1–2 的 sidecar 模式（退出码 0/2/3）。
- 产出：`resolvePython()` → `string|null`；`runSidecar(args, {timeoutMs})` → `{ok, degraded, reason, json, stderr, exitCode}`；`emitDegradedJsonAndExit(reason, fix)`；`PLUGIN_DIR`、`SIDECAR_PATH`。被 Task 4–7 消费。

- [ ] **步骤 1：编写桥接 `_sidecar.mjs`**

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

- [ ] **步骤 2：编写中继 `bge-vl.mjs`**

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

- [ ] **步骤 3：编写插件自测 `test-self.mjs`**

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

- [ ] **步骤 4：运行自测，验证并提交**

运行：
```bash
node plugins/swarmlo-bge-vl/scripts/test-self.mjs
```
预期：降级演练通过；health 演练通过（本机有 Python 3.12.0）或跳过。

```bash
git add plugins/swarmlo-bge-vl/scripts/_sidecar.mjs plugins/swarmlo-bge-vl/scripts/bge-vl.mjs plugins/swarmlo-bge-vl/scripts/test-self.mjs
git commit -m "feat: bge-vl JS relay with graceful degradation (ADR-150 pattern)"
```

---

### Task 4：核心 `bge-vl` 命令 dispatcher + 注册 + vitest

**文件：**
- 新建：`v3/@claude-flow/cli/src/commands/bge-vl.ts`
- 修改：`v3/@claude-flow/cli/src/commands/index.ts`（在第 84、204、264–288 行附近镜像 metaharness 的注册位置）
- 新建：`v3/@claude-flow/cli/__tests__/bge-vl-command.test.ts`

**接口：**
- 消费：`plugins/swarmlo-bge-vl/scripts/bge-vl.mjs`（Task 3）；来自 `../types.js` 的 `Command`/`CommandContext`/`CommandResult`。
- 产出：`resolveBgeVlPluginDir(): string | null`；`bgeVlCommand: Command`。被 Task 6 消费（doctor 复用同一套向上查找策略，但不复用该函数 —— doctor 必须保持无 mock）。

- [ ] **步骤 1：先写会失败的测试**

`v3/@claude-flow/cli/__tests__/bge-vl-command.test.ts`：

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

- [ ] **步骤 2：运行它，看着它失败**

运行：`cd v3/@claude-flow/cli && npx vitest run __tests__/bge-vl-command.test.ts`
预期：FAIL —— `Cannot find module '../src/commands/bge-vl.js'`。

- [ ] **步骤 3：实现 dispatcher**

`v3/@claude-flow/cli/src/commands/bge-vl.ts`：

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

- [ ] **步骤 4：在 `commands/index.ts` 中注册**

完全镜像 metaharness 的注册方式：
- 在第 84 行附近的命令映射中加入：`  'bge-vl': () => import('./bge-vl.js'),`
- 在第 204 行附近加入 getter：`export async function getBgeVlCommand() { return loadCommand('bge-vl'); }`
- 在第 264–288 行附近把 `bgeVlCmd` 加入 `loadCommand('...')` 列表与聚合列表（复制 metaharness 条目 `metaharnessCmd`，并在每一处旁边加上 `bgeVlCmd`）。

- [ ] **步骤 5：运行测试 + tsc 构建**

运行：
```bash
cd v3/@claude-flow/cli && npx vitest run __tests__/bge-vl-command.test.ts && pnpm -r build
```
预期：4 个测试 PASS；tsc exit 0。

- [ ] **步骤 6：提交**

```bash
git add v3/@claude-flow/cli/src/commands/bge-vl.ts v3/@claude-flow/cli/src/commands/index.ts v3/@claude-flow/cli/__tests__/bge-vl-command.test.ts
git commit -m "feat: bge-vl core command dispatcher over the plugin relay (ADR-384)"
```

---

### Task 5：拒绝消息指向 sidecar

**文件：**
- 修改：`v3/@claude-flow/cli/src/memory/embedding-models.ts`（多模态 docstring）
- 修改：`v3/@claude-flow/cli/src/memory/bge-embedder.ts`（拒绝文案）
- 修改：`v3/@claude-flow/cli/src/memory/memory-initializer.ts`（`loadEmbeddingModel` 中的拒绝文案）
- 修改：`v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts`（断言该指引）

**接口：**
- 消费：ADR-384 §2 的措辞（Task 0）。
- 产出：文本管线拒绝错误现在包含 `bge-vl`；不被任何代码消费，由测试断言。

- [ ] **步骤 1：先更新测试（使其失败）**

在 `v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts` 中，在现有 BGE-VL 拒绝测试里，保留当前断言（`/multimodal \(vision-language\)/` 与 `CLAUDE_FLOW_EMBEDDING_MODEL`），并添加：

```ts
      expect(String(error)).toMatch(/npx swarmlo bge-vl/);
```

- [ ] **步骤 2：运行它，看着它失败**

运行：`cd v3/@claude-flow/cli && npx vitest run __tests__/memory-initializer-hook.test.ts`
预期：FAIL —— 错误中不包含 `npx swarmlo bge-vl`。

- [ ] **步骤 3：更新三个源文件**

`embedding-models.ts` —— 追加到 `multimodal?` docstring（保留现有句子）：

```ts
   * The working pipeline lives in the swarmlo-bge-vl plugin (Python
   * sidecar, isolated bge-vl.db) — see ADR-384. Loaders refuse with a
   * pointer to `npx swarmlo bge-vl embed`.
```

`bge-embedder.ts` —— 将拒绝文案替换为：

```ts
    if (spec.multimodal) {
      state.error =
        `${modelName} is a multimodal (vision-language) model — the text-only ` +
        'ONNX pipeline cannot load it (no ONNX export; requires image input + remote code). ' +
        'Use the BGE-VL sidecar instead: `npx swarmlo bge-vl embed --text "..."` (ADR-384).';
      return null;
    }
```

`memory-initializer.ts` —— 定位 `loadEmbeddingModel` 内 `multimodal` 拒绝块（返回 `success:false` 且提及 `CLAUDE_FLOW_EMBEDDING_MODEL` 的那段）。先读它，保留每一句现有句子，并追加：

```ts
    ' Use the BGE-VL sidecar instead: `npx swarmlo bge-vl embed --text "..."` (ADR-384).';
```

- [ ] **步骤 4：运行测试，确认通过**

运行：`cd v3/@claude-flow/cli && npx vitest run __tests__/memory-initializer-hook.test.ts __tests__/embedding-models.test.ts`
预期：全部 PASS（注册表测试不受影响）。

- [ ] **步骤 5：提交**

```bash
git add v3/@claude-flow/cli/src/memory/embedding-models.ts v3/@claude-flow/cli/src/memory/bge-embedder.ts v3/@claude-flow/cli/src/memory/memory-initializer.ts v3/@claude-flow/cli/__tests__/memory-initializer-hook.test.ts
git commit -m "feat: route BGE-VL refusal messages to the sidecar pipeline"
```

---

### Task 6：doctor 组件 `checkBgeVlIntegration`

**文件：**
- 修改：`v3/@claude-flow/cli/src/commands/doctor.ts`（新增检查函数，并在 `checkMetaharnessIntegration` 的调用点旁注册）
- 修改：已覆盖 `checkMetaharnessIntegration` 的 doctor 测试文件（grep `__tests__/doctor*.test.ts` 找它；在包含它的那个文件里新增用例）

**接口：**
- 消费：`HealthCheck` 类型（已有）；Task 1/3 的插件布局。
- 产出：`checkBgeVlIntegration(): Promise<HealthCheck>` —— 插件缺失时 `warn`（可选姿态，同 metaharness），文件 + python 齐全时 `pass`，python 缺失时 `warn` 并给出修复提示 `npx swarmlo bge-vl setup`。

- [ ] **步骤 1：找到注册位置与现有 doctor 测试模式**

```bash
grep -n "checkMetaharnessIntegration" v3/@claude-flow/cli/src/commands/doctor.ts
grep -rn "checkMetaharnessIntegration" v3/@claude-flow/cli/__tests__/ | head -5
```

- [ ] **步骤 2：在找到的 doctor 测试文件中写会失败的测试**

镜像现有 metaharness 用例的 mock 风格（mock `fs.existsSync` + `child_process.spawnSync`（如果它用的是这个）；否则导入真实函数，只 mock `existsSync`）：

```ts
  it('checkBgeVlIntegration warns when the plugin is absent', async () => {
    existsSyncMock.mockReturnValue(false);
    const check = await checkBgeVlIntegration();
    expect(check.status).toBe('warn');
    expect(check.message).toMatch(/swarmlo-bge-vl/);
    expect(check.fix).toMatch(/bge-vl setup/);
  });
```

运行：`cd v3/@claude-flow/cli && npx vitest run <那个测试文件>`
预期：FAIL —— `checkBgeVlIntegration is not defined`。

- [ ] **步骤 3：在 `doctor.ts` 中实现**

在 `checkMetaharnessIntegration` 的右花括号之后添加：

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

然后注册：在 doctor 健康检查列表里 `checkMetaharnessIntegration()` 被 await 的位置，在其旁边加上 `checkBgeVlIntegration()`（沿用该文件相同的 Promise.all 或顺序 await 模式 —— 先读调用点并与其保持一致）。

- [ ] **步骤 4：运行 doctor 测试 + 构建**

运行：`cd v3/@claude-flow/cli && npx vitest run <doctor 测试文件> && pnpm -r build`
预期：新用例 PASS；tsc exit 0。

- [ ] **步骤 5：提交**

```bash
git add v3/@claude-flow/cli/src/commands/doctor.ts v3/@claude-flow/cli/__tests__/<doctor 测试文件>
git commit -m "feat: doctor component for BGE-VL sidecar availability"
```

---

### Task 7：发布镜像 + CI 可移除性门禁

**文件：**
- 修改：`v3/@claude-flow/cli/scripts/prepare-publish.mjs`（镜像插件）
- 新建：`.github/workflows/no-bge-vl-smoke.yml`

**接口：**
- 消费：插件布局（Task 1–3）、中继/test-self（Task 3）。
- 产出：发布的 `@claude-flow/cli` 包包含 `plugins/swarmlo-bge-vl/`；CI 强制可移除性。

- [ ] **步骤 1：在 `prepare-publish.mjs` 中加入镜像**

读取 metaharness 镜像块（约第 35–40 行，`await cp(join(repoRoot, 'plugins', 'swarmlo-metaharness'), join(pluginsDir, 'swarmlo-metaharness'), { recursive: true })`）。紧跟其后添加：

```js
await cp(
  join(repoRoot, 'plugins', 'swarmlo-bge-vl'),
  join(pluginsDir, 'swarmlo-bge-vl'),
  { recursive: true },
);
```

- [ ] **步骤 2：编写 CI workflow**

`.github/workflows/no-bge-vl-smoke.yml`：

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

- [ ] **步骤 3：在本地验证 CI 将要运行的步骤**

```bash
python -X utf8 -m py_compile plugins/swarmlo-bge-vl/python/bge_vl_embed.py
python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-ci.db
node plugins/swarmlo-bge-vl/scripts/test-self.mjs
SWARMLO_BGE_VL_PYTHON=/nonexistent-python node plugins/swarmlo-bge-vl/scripts/bge-vl.mjs embed --text x; echo "exit=$?"
```
预期：全部通过；降级演练 exit 0 且输出 `"degraded": true`。

- [ ] **步骤 4：提交**

```bash
git add v3/@claude-flow/cli/scripts/prepare-publish.mjs .github/workflows/no-bge-vl-smoke.yml
git commit -m "ci: BGE-VL removability gate + publish mirror (ADR-384)"
```

---

### Task 8：文档收尾 + 全量验证

**文件：**
- 修改：`v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md`（Verification 一节 → 实测结果）
- 修改：`embedding-models-2026-08-16.md`（BGE-VL 表格行 + 快速结论 bullet）

**接口：**
- 消费：以上全部。
- 产出：规格/文档与已交付代码保持一致。

- [ ] **步骤 1：更新 `embedding-models-2026-08-16.md`**

将 BGE-VL 表格行（第一节）替换为：

```markdown
| `BAAI/bge-vl-base` / `BAAI/bge-vl-large` | 768 | **2026-08-19 接入**：CLIP 风格多模态（视觉-语言）。文本 ONNX 管线仍拒绝加载并指向 sidecar；**工作管线在 `plugins/swarmlo-bge-vl/`**——Python sidecar（transformers + trust_remote_code）+ 独立 `bge-vl.db`（768 维守卫，绝不进 memory.db 的 1024 维 HNSW）。命令：`npx swarmlo bge-vl embed|store|search|setup`；缺 Python 优雅降级 | `v3/@claude-flow/cli/src/commands/bge-vl.ts`、`plugins/swarmlo-bge-vl/` |
```

将快速结论的 BGE-VL bullet 替换为：

```markdown
- **BGE-VL（2026-08-19 工作管线）**：注册表保持 `bge-vl-base`/`bge-vl-large`（`multimodal: true`）；文本管线加载失败时给出 sidecar 指引。真正的图文嵌入走 `npx swarmlo bge-vl setup`（venv：torch CPU + transformers）→ `bge-vl embed --text/--image` → `bge-vl store/search`（独立 `~/.swarmlo/bge-vl/bge-vl.db`，768 维专属，维度守卫拒绝混库）。`CLAUDE_FLOW_HF_ENDPOINT` 镜像透传；模型默认 `BAAI/bge-vl-large`（`SWARMLO_BGE_VL_MODEL` 可换）。
```

- [ ] **步骤 2：将 ADR-384 的 Verification 一节更新为实际结果**（在运行步骤 3 之后填写确切的通过数量）。

- [ ] **步骤 3：全量验证**

```bash
cd v3/@claude-flow/cli && pnpm -r build
cd v3/@claude-flow/cli && npx vitest run __tests__/bge-vl-command.test.ts __tests__/memory-initializer-hook.test.ts __tests__/embedding-models.test.ts
node plugins/swarmlo-bge-vl/scripts/test-self.mjs
python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-final.db
```

预期：tsc exit 0；所有 vitest 文件通过；两个 self-test 通过。

- [ ] **步骤 4：提交**

```bash
git add v3/docs/adr/ADR-384-bge-vl-multimodal-registration.md embedding-models-2026-08-16.md
git commit -m "docs: finalize ADR-384 verification + embedding-model inventory"
```

---

## 执行说明

- Windows 开发机：`python` 解析为 3.12.0；通过 `npx swarmlo bge-vl setup` 引导 venv 时使用 CPU torch 索引（约 200MB，对比 CUDA 2.5GB）。模型下载（bge-vl-large 约 1.6GB）为一次性 HF 缓存，可用 `CLAUDE_FLOW_HF_ENDPOINT=https://hf-mirror.com` 走镜像。
- 手工端到端（Task 3 之后，可选）：`setup` → `embed --text "a bear"`（预期 768 个浮点数）→ `store --key bear --text "a bear"` → `search --text "a bear"`（最高命中 cosine ≈ 1.0）。
- 本计划有意在 sidecar 内部复用核心 cosineSim/mmrRerank 的*语义*（在向量所在的位置做同样的数学运算）；从插件中继导入 TS 工具函数会破坏发布包布局，因此中继像 metaharness skills 一样保持零依赖。
