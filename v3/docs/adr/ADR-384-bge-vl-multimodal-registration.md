# ADR-384 — BGE-VL registered but refused by the text-only pipeline

- **Status**: Accepted
- **Date**: 2026-08-19
- **Related**: ADR-382 (shared embedding-model registry + loader hook), ADR-383 (bge-reranker-v2-m3 default), ADR-150 (plugin removability)
- **Prompted by**: the user's request to configure BAAI's BGE-VL multimodal embedding family alongside the existing bge-m3 recall + v2-m3 rerank pair. 2026-08-19: direction superseded — registration-with-refusal becomes registration + a working Python-sidecar pipeline in a removable plugin.

## Context

BGE-VL (`BAAI/bge-vl-base`, `BAAI/bge-vl-large`, released 2024-12-27) is a CLIP-style **multimodal (vision-language)** embedding family: separate ViT image encoder + text tower projecting both modalities into a shared space, accepting text, images, or composed image+text queries. It is not a drop-in replacement for the text-only bi-encoders (bge-m3, MiniLM) already in `EMBEDDING_MODELS`:

- **No ONNX export exists** (checked 2026-08-19). The repos require `trust_remote_code=True` plus a Python image processor — the transformers.js loaders used here (`bge-embedder.ts`, `memory-initializer.ts`) run ONNX only.
- **Different pooling**: CLIP-style projection outputs, not CLS-token pooling + L2. Loading it through the existing text path would yield wrong-pooling vectors, not a working embedder.

The honest integration is therefore **registration-with-refusal**: make the models resolvable/configurable, and make any load attempt fail loudly with an actionable error — instead of silently degrading or surfacing a raw ONNX error.

## Decision

### 1. Register the BGE-VL family in the shared registry (unchanged)

`EMBEDDING_MODELS` gains `BAAI/bge-vl-base` and `BAAI/bge-vl-large`:

- new family `'bge-vl'`, new spec flag `multimodal: true`
- short-ID aliases `bge-vl-base` / `bge-vl-large` (CLI-flag / embeddings.json style)
- `BAAI/bge-vl-large` dim = 768 (verified via the HF discussion: `get_text_features` → `(2, 768)`); base dim = 768 per the BAAI model card, **unverified in-tree** — dim is informational only (loads are refused), and the registry comment says so

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

Measured 2026-08-19 (local, `main`, after Task 8 doc finalization):

- **Build**: `pnpm -r build` (from `v3/`) — exit 0; every package's `tsc` passes (plus `security` OAuth export surface verification).
- **Vitest — 4 files / 35 tests, all green, exit 0**: `__tests__/bge-vl-command.test.ts`, `__tests__/memory-initializer-hook.test.ts` (refusal + pointer), `__tests__/embedding-models.test.ts`, `__tests__/doctor-bge-vl-integration.test.ts`.
- **JS relay self-test**: `node plugins/swarmlo-bge-vl/scripts/test-self.mjs` — degraded drill (`bge-vl-python-unavailable`) + health drill (dim 768), exit 0.
- **Python sidecar self-test**: `python -X utf8 plugins/swarmlo-bge-vl/python/bge_vl_embed.py self-test --db /tmp/bge-vl-final.db` → `{"ok": true, "self-test": "pass", "dim": 768}`, exit 0.
- **CLI smoke (out of CI)**: `node v3/@claude-flow/cli/bin/cli.js bge-vl health` → `{"ok": true, "dim": 768, "count": 0, "db": "~/.swarmlo/bge-vl/bge-vl.db"}`, exit 0.
- **CI `no-bge-vl-smoke.yml`**: workflow committed as the removability gate; first green PR run still pending — not yet exercised on CI (its drill content passes locally via the JS relay self-test above).
- Manual (out of CI): `npx swarmlo bge-vl setup` → `embed --text` → 768-dim vector; `store` → `search` cosine 1.0 for identical text.
