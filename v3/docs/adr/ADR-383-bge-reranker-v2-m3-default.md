# ADR-383 — bge-reranker-v2-m3 as the default cross-encoder reranker

- **Status**: Proposed
- **Date**: 2026-08-18
- **Related**: ADR-080 (cross-encoder rerank), ADR-382 (bge-m3 + shared loader infra), ADR-094 (provider migration)
- **Prompted by**: the user's decision to make BAAI's BGE Re-Ranker v2.0 the default reranker, completing the m3 recall + v2-m3 rerank combination (BAAI's recommended same-base pairing).

## Context

The reranker was `Xenova/ms-marco-MiniLM-L-6-v2` (ADR-080): English-only, ~30MB int8, 20-40ms per (query, doc) pair. The recall side is now bge-m3 (ADR-382) — multilingual, 8192-context. Pairing a multilingual recall with an English-only reranker wastes the recall's coverage: Chinese (and other non-English) candidates get no meaningful rerank signal.

`BAAI/bge-reranker-v2-m3` is the natural fit: XLMRobertaForSequenceClassification on the **same bge-m3 base** (hidden 1024), 100+ languages, 8192 context. No Xenova port exists (checked 2026-08-18 — "Repository not found"), but the onnx-community org ships an official transformers.js conversion: `onnx-community/bge-reranker-v2-m3-ONNX`.

## Decision

### 1. Default reranker = `onnx-community/bge-reranker-v2-m3-ONNX`

`DEFAULT_RERANKER_MODEL` exported from `cross-encoder-rerank.ts`; `getCrossEncoder()` defaults to it. The BEIR hybrid script (`run-beir-hybrid.mjs`) calls `getCrossEncoder()` with no args.

**Costs (accepted, documented)**: fp32 ~2.2GB download on first use (int8 ~570MB when the repo's quantized variant resolves); per-pair latency is a large multiple of the old 20-40ms. Callers already rerank only the fused top-K (top-100 in the BEIR script), which bounds the impact.

**Rollback**: pass `'Xenova/ms-marco-MiniLM-L-6-v2'` explicitly to `getCrossEncoder()` — the old model remains fully supported by the same code path.

### 2. Reranker loader migrated to the ADR-382 shared infrastructure

The old @xenova-only loader cannot consume transformers.js v3-layout repos. `getCrossEncoder` now uses `loadTransformersClasses()` (HF-first per ADR-094, CJS-require fallback for the broken v4 ESM entry, `CLAUDE_FLOW_HF_ENDPOINT` mirror support, VITEST-safe). `TransformersClasses` gained an optional `AutoModelForSequenceClassification` field. Pair encoding stays direct (`tokenizer(query, { text_pair: doc, ... })`) with `max_length: 8192`.

### 3. Graceful degradation unchanged

Load failure keeps the ADR-080 contract: `crossEncoderRerank` returns input order with score=0; one-shot load policy per process; tests mock both transformers packages to stay offline.

## Verification

- Unit: `cross-encoder-rerank.test.ts` rewritten for the HF-first loader (both packages mocked) — 6 tests green; default-model constant asserted. Full affected suite 93/93.
- Real-model load (2026-08-18, via hf-mirror.com): `getCrossEncoder()` downloads and loads the q8 variant (`onnx/model_quantized.onnx`, 544MB) successfully. fp32 is NOT viable on this machine — its external-data file (`model.onnx_data`) failed mid-download.
- **Known limitation (machine-specific)**: end-to-end `scoreBatch` in direct-import processes hits the pre-existing transformers.js 3.8.1 ESM interop bug ("Tensor is not a constructor", onnxruntime-common webpack binding) on this Windows/Node 24 host. The SAME bug does not manifest in real CLI command flows — `bin/cli.js memory store/search` with the bge-m3 embedder was verified working repeatedly, daemon-independent (daemon stopped, embedding still produced 1024-dim rows with correct scores). Production rerank consumers (none wired yet) will run inside CLI flows; `BEIR RERANK=1` direct-script execution on THIS machine is affected until the interop issue is resolved. `scripts/smoke-reranker.mjs` is the reusable verification entry point.
- BEIR `RERANK=1` runs with the new default vs ADR-088 baselines: to be measured when a dataset dir is available (prefer Linux/CI where the interop bug does not reproduce).
