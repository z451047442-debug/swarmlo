# ADR-382 — bge-m3 dense + sparse integration and the production embedding-model hook

- **Status**: Proposed
- **Date**: 2026-08-16
- **Related**: ADR-085 (BEIR harness + BGE embedder swap), ADR-086 (BGE embedder lineage), ADR-088 (Lucene BM25 + rerank), ADR-090 (BGE query prefix, opt-in), ADR-094 (provider migration to `@huggingface/transformers`)
- **Prompted by**: an evaluation of `Xenova/bge-m3` vs `Xenova/bge-large-zh-v1.5` for the project's embedding stack. m3 is stronger on every axis (1024-dim dense, 8192-token context, 100+ languages, native MLM-head sparse retrieval, C-MTEB ≈66.1 vs ≈64.5) and the user chose full integration: **dense + sparse**, plus a **production model hook** so the memory pipeline is not hardwired to MiniLM forever.

## Context

Three code-level blockers made m3 unusable before this change:

1. `bge-embedder.ts` inferred `dim()` from the model name (`'small'→384, 'large'→1024, else 768`) — `Xenova/bge-m3` contains neither substring, so it reported the wrong 768 instead of 1024. A stale comment claimed the real dim was "filled after first embed"; it never was.
2. `max_length: 512` was hardcoded, truncating m3's 8192-token context.
3. The embedder still loaded `@xenova/transformers` only (ADR-094 never migrated it), and the Xenova/bge-m3 repo now ships the transformers.js v3 repo layout — legacy v2 may not load it.

The sparse side did not exist anywhere in the tree: zero hits for `MaskedLM`/`AutoModelForMaskedLM`/`colbert`; BM25 (Okapi + Lucene-style) is the entire lexical side (ADR-088). The production pipeline (`loadEmbeddingModel`) hardcoded `Xenova/all-MiniLM-L6-v2` with no model-name hook, and the whole 384-dim ecosystem (AgentDB bridge, HNSW, plugins) is dimension-typed — mixing vector spaces silently corrupts search.

## Decision

### 1. Shared registry `src/memory/embedding-models.ts` — one config table, three consumers

A pure `EmbeddingModelSpec` table (dim / maxSeqLength / pooling / queryPrefix / family / sparse / sparseWeight) is the single source of truth consumed by the BGE embedder, the sparse path, and the production hook. Resolution: exact modelId → short-ID alias (`bge-m3`, `all-MiniLM-L6-v2` — embeddings.json style) → substring heuristic preserving the legacy dim behavior for unregistered models. Entries: bge-en trio, **bge-large-zh-v1.5** (Chinese query prefix — free with the table), **bge-m3** (1024, 8192, `queryPrefix: null` — instruction-free), MiniLM. `BGE_QUERY_PREFIX` moves into the registry and is re-exported from `bge-embedder.ts` byte-identically.

### 2. `bge-embedder.ts` — provider-agnostic, spec-driven, per-model state

- `loadTransformersClasses()` applies the ADR-094 pattern to the low-level classes (HF-first, xenova fallback) with `safeProp` reads (vitest mocks throw on undefined exports; real modules don't — the loader must survive both).
- `dim()` returns `spec.dim` immediately and backfills the REAL hidden dim from the first embed output (the stale comment is now true).
- Tokenizer truncation, query prefix, and pooling all come from the spec. `embedQuery` on m3 is a no-op prefix-wise.
- Load state is keyed **per model name** — a failed m3 load no longer poisons the default base-en load (the old singleton + global one-shot flag did).

### 3. `src/memory/bge-sparse.ts` — m3 native sparse (MLM-head lexical weights)

BAAI FlagEmbedding semantics: `w_t = ReLU(max_vocab(logits[t]))`. `extractSparseWeights` is a pure, unit-testable function (with attention-mask support); the model wrapper maps positions → vocab ids (duplicates merged by max), loads via `AutoModelForMaskedLM` (`quantized: true`), and processes batch=1 by design — one 512-token doc already produces ~512 MB of fp32 logits over a 250k vocab. `sparseDotProduct` (ids) and `sparseDotByToken` (strings) are exported for fusion. Sparse is **m3-only**: the registry gates it, other models return null. Status/reset mirror the cross-encoder contract.

### 4. Fusion — RRF third system + a pure weighted-sum helper

- `fuseDenseSparse(dense, sparse, denseWeight=1, sparseWeight=0.3)` in `hybrid-retrieval.ts`: min-max-normalise each side, then weighted sum (BAAI's 1:0.3 recipe in score space).
- `run-beir-hybrid.mjs` gains an **opt-in** `BGE_SPARSE=1` third RRF system (sparse RRF weight 0.3, `SPARSE_RRF_WEIGHT` overridable) with a `{model}.sparse.json` doc cache (token STRINGS, portable across tokenizer versions). BM25 defaults are untouched, so ADR-088 baselines remain the measured default path. RRF (not score-space mixing) is the harness fusion because RRF is scale-invariant and already tuned per dataset.

### 5. Production hook — `loadEmbeddingModel({ modelName?, dimension? })`

- Precedence: options > `CLAUDE_FLOW_EMBEDDING_MODEL` / `CLAUDE_FLOW_EMBEDDING_DIMENSION` env > `.claude-flow/embeddings.json` (`model` field; its dimension is a hint, not authoritative) > default. **Revised 2026-08-17: the default model IS `Xenova/bge-m3` (1024-dim)** — the initial MiniLM-384 default was replaced by user decision. Consequence: a fresh default install downloads the m3 ONNX weights (~570 MB int8) on first embedding use; offline installs get a loud "BGE embedder failed to load" error instead of a silent hash fallback. `CLAUDE_FLOW_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2` is the documented escape hatch back to the graceful-degradation chain.
- The cache key becomes `model:dim` — switching models reloads instead of returning stale `'cached'`.
- BGE-family models route to `getBgeEmbedder`, wrapped as `(text) => ({ data })` (a bare Float32Array fails `generateLocalEmbedding`'s `Array.isArray` check and silently degrades to hash). If a configured BGE model cannot load, the call **fails loudly** instead of serving wrong-pooling vectors from the generic chain.
- **Bridge rule (revised 2026-08-17)**: the AgentDB bridge runs only when nothing was explicitly configured AND the resolved model is the bridge's own MiniLM (`BRIDGE_EMBEDDING_MODEL`). Under the bge-m3 default that condition never holds, so the local memory pipeline bypasses the bridge entirely — the bridge remains the backend for its direct AgentDB/plugin consumers. An explicit MiniLM config also bypasses (the explicit-any-model rule adopted 2026-08-16). This applies to ALL local memory entry points: `loadEmbeddingModel`, `generateEmbedding`, `storeEntry`, `searchEntries`, `addToHNSWIndex`, `searchHNSWIndex`, `listEntries`, `getEntry`, `deleteEntry`, `purgeNamespace`, and controller activation (`activateControllerRegistry`) — anything less would split storage between the bridge and sql.js. (`walRefusalError` still consults the bridge for diagnostics only.)
- **HF mirror support (2026-08-17)**: `CLAUDE_FLOW_HF_ENDPOINT` (fallback `HF_ENDPOINT`) sets the transformers module's `env.remoteHost` before any `from_pretrained()` call — all three loaders (BGE classes, sparse MaskedLM, and the memory-initializer pipeline) apply it, so restricted networks can pull models from a mirror (e.g. hf-mirror.com) instead of huggingface.co.

### 6. Old-vector incompatibility — two-layer guard, never silent

- **Layer 1 (at load)**: `dimension` option/env checked against every branch's actual dims via a shared `finishBranch` — mismatches return `success: false` with an actionable error.
- **Layer 2 (at write)**: `storeEntry` reads `vector_indexes.dimensions` for the namespace from the open handle and calls `assertDimensionCompatible` before the INSERT. Missing rows (legacy DBs) mean "unknown" → allowed, no forced migration.
- Error text names both spaces and the rebuild command (`claude-flow memory init --force`). `getInitialMetadata` now seeds `embedding_model` / `embedding_dimensions` metadata and dimension-matched `vector_indexes` rows from the configured model, so a fresh bge-m3 install is self-consistent.

## Guardrails (in scope, documented)

- The five 384-dim plugins (`ruflo-agentdb`, `ruflo-rag-memory`, `ruflo-ruvector`, `ruflo-neural-trader`) are untouched — they talk to AgentDB directly; the local memory pipeline's default is now bge-m3 (1024), which is why the bridge (MiniLM 384) is bypassed by default.
- `task-embedder.ts` and the neural router remain MiniLM (independent paths; follow-up).
- Sparse storage in the production memory DB is deferred — the file cache is the BEIR/harness surface; ColBERT is out of scope.
- `claude-flow.config.json` gains no embedding-model field (config-adapter has none; follow-up).

## Verification

- Unit: `embedding-models` / `bge-embedder` / `bge-sparse` / `hybrid-retrieval` / `memory-initializer-hook` suites — all offline (mocked providers, synthetic tensors).
- **Real-model smoke COMPLETED (2026-08-17, via hf-mirror.com)**: bge-m3 fp32 (2.2 GB) downloaded and executed in the CLI memory path — store writes 1024-dim rows, identical-text search returns cosine 1.00, related queries hit (0.17–0.22). Key findings recorded below.
- BEIR dense/sparse runs vs the ADR-088 baselines remain to be measured when a dataset dir is available.

### Real-model smoke findings (2026-08-17)

- **transformers.js version trap**: `@huggingface/transformers@4.x` ESM entry fails to LOAD on this host (`Named export 'Tensor' not found` — onnxruntime-common CJS interop); its CJS entry and 3.8.1's CJS entry both fail at execution with `Tensor.location must be a string` (with onnxruntime-node 1.24.3 AND 1.27.0). The working path is the **3.8.1 ESM entry in the CLI process**. Pin: `^3.8.1`. The loaders keep dynamic-import-first (vitest mock compatibility) with a native `createRequire` fallback for the CJS entry, disabled under `VITEST=1`.
- **`{ quantized: true }` is ignored** for v3-layout repos → the fp32 model (2.2 GB) is what loads; the model cache lives inside the pnpm-store package dir (`.cache/Xenova/bge-m3/`). A `dtype: 'q8'` switch (~570 MB) is a follow-up.
- **Threshold calibration**: bge-m3's dense space is looser than MiniLM's — related-pair cosine measured 0.17–0.22, far below the legacy 0.7 CLI default. Fix: registry `defaultThreshold: 0.15` for m3; `searchEntries` and the `memory search` command derive model-aware defaults; the command option's hardcoded `default: 0.7` was removed. Explicit `--threshold` always wins.
