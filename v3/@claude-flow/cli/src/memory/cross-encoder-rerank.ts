// Cross-encoder reranker — scores (query, document) pairs jointly.
//
// Why a cross-encoder after hybrid? The bi-encoder + BM25 pipeline returns
// the top-K candidates fast. A cross-encoder re-reads each (query, doc) pair
// jointly and produces a calibrated relevance score — paper-proven path
// for closing the residual top-1 gap.
//
// ADR-383 (2026-08-18): the default reranker is BAAI's bge-reranker-v2-m3
// (onnx-community ONNX port, ~2.2GB fp32 / ~570MB int8) — the same XLM-R
// base as bge-m3, so the m3 recall + v2-m3 rerank combo shares one
// tokenizer family and covers 100+ languages (the legacy ms-marco-MiniLM
// was English-only and ~30MB). Cost per (query, doc) pair is notably higher
// than the old 20-40ms — callers rerank only the fused top-K.
//
// We lazy-load and cache the singleton. If the model fails to load,
// rerank() is a no-op (returns input order with score=0) — never breaks the
// caller.
//
// ADR-080 (original design) + ADR-382 (shared loader infra).

import { loadTransformersClasses } from './bge-embedder.js';

export const DEFAULT_RERANKER_MODEL = 'onnx-community/bge-reranker-v2-m3-ONNX';

type CrossEncoder = {
  /** Score a list of (query, doc) pairs. Returns an array of scores aligned to input. */
  scoreBatch(query: string, docs: string[]): Promise<number[]>;
  isReady(): boolean;
};

let singleton: CrossEncoder | null = null;
let loadAttempted = false;
let loadError: string | null = null;

/**
 * Lazy-load the cross-encoder singleton. Returns null if the model can't be
 * loaded (no network, no model cache, package missing). Subsequent calls
 * after a failure return null immediately — we don't retry.
 */
export async function getCrossEncoder(modelName = DEFAULT_RERANKER_MODEL): Promise<CrossEncoder | null> {
  if (singleton) return singleton;
  if (loadAttempted) return null;
  loadAttempted = true;

  try {
    // ADR-382: shared provider-agnostic loader (HF-first per ADR-094, CJS
    // require fallback for the broken v4 ESM entry, HF mirror endpoint
    // support, VITEST-safe) — the old @xenova-only path cannot load
    // transformers.js v3-layout repos.
    const classes = await loadTransformersClasses();
    if (!classes?.AutoModelForSequenceClassification) {
      loadError = 'AutoTokenizer / AutoModelForSequenceClassification unavailable';
      return null;
    }
    // Direct tokenizer + model load — pipeline('text-classification') can't
    // ingest {text, text_pair} pairs reliably. Doing the pair encoding
    // ourselves keeps the documented BERT pair-encoding signature.
    // ADR-383: HF v3 ignores `quantized: true` (and fp32's external-data
    // file makes multi-GB downloads fragile) — dtype 'q8' resolves the
    // repo's onnx/model_quantized.onnx (544MB, verified). xenova v2 keeps
    // the legacy `quantized` flag.
    const quantOpts =
      classes.source === '@huggingface/transformers'
        ? { dtype: 'q8' }
        : { quantized: true };
    const tokenizer = await classes.AutoTokenizer.from_pretrained(modelName, {});
    const model = await classes.AutoModelForSequenceClassification.from_pretrained(modelName, quantOpts);

    singleton = {
      async scoreBatch(query: string, docs: string[]): Promise<number[]> {
        if (docs.length === 0) return [];
        // Encode each (query, doc) pair separately, then batch through model.
        // MS MARCO cross-encoders output a single logit per pair — sigmoid it
        // to get a relevance probability.
        const scores: number[] = [];
        // ADR-383: HF v3's `text_pair` tokenizer path can trip the
        // webpack/onnxruntime ESM interop bug ("Tensor is not a
        // constructor") on the node build. Manually joining query + doc
        // with the tokenizer's separator produces the identical
        // [CLS] q [SEP] d [SEP] pair encoding for both XLM-R ('</s>')
        // and BERT ('[SEP]') families. xenova v2 keeps text_pair.
        const isHfSource = classes.source === '@huggingface/transformers';
        const sepToken = (tokenizer as any).sep_token ?? '</s>';
        for (const doc of docs) {
          const inputs = isHfSource
            ? await tokenizer(`${query}${sepToken}${doc}`, {
                padding: true,
                truncation: true,
                max_length: 8192, // bge-reranker-v2-m3 supports 8k; bounds inference memory
              })
            : await tokenizer(query, {
                text_pair: doc,
                padding: true,
                truncation: true,
                max_length: 8192,
              });
          const out = await model(inputs);
          // Output: { logits: Tensor([1, 1]) } for MS MARCO scoring head.
          // Some variants emit [1, 2] (binary classifier) — handle both.
          const logits = out.logits?.data ?? out.logits ?? out;
          const raw = Array.isArray(logits) ? logits : Array.from(logits as ArrayLike<number>);
          let score: number;
          if (raw.length === 1) {
            // Single logit → sigmoid
            score = 1 / (1 + Math.exp(-raw[0]));
          } else if (raw.length >= 2) {
            // Binary softmax → P(relevant) = exp(l1) / (exp(l0) + exp(l1))
            const e0 = Math.exp(raw[0]);
            const e1 = Math.exp(raw[1]);
            score = e1 / (e0 + e1);
          } else {
            score = 0;
          }
          scores.push(score);
        }
        return scores;
      },
      isReady() { return true; },
    };
    return singleton;
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

/**
 * Rerank a list of candidate documents against a query. Returns the input
 * indices reordered by cross-encoder score (descending), each annotated with
 * the calibrated score.
 *
 * If the cross-encoder isn't available, returns the input indices in their
 * original order with score=0 — caller should fall back gracefully.
 */
export async function crossEncoderRerank(
  query: string,
  docs: string[],
  topK?: number,
): Promise<Array<{ index: number; score: number }>> {
  const ce = await getCrossEncoder();
  if (!ce) {
    // Graceful fallback — original order, zero scores.
    return docs.map((_, i) => ({ index: i, score: 0 }))
      .slice(0, topK ?? docs.length);
  }
  const scores = await ce.scoreBatch(query, docs);
  const ranked = scores
    .map((score, index) => ({ index, score }))
    .sort((a, b) => b.score - a.score);
  return topK != null ? ranked.slice(0, topK) : ranked;
}

/** Diagnostic — surface whether the model is loaded and any load error. */
export function getCrossEncoderStatus(): { loaded: boolean; attempted: boolean; error: string | null } {
  return { loaded: !!singleton, attempted: loadAttempted, error: loadError };
}

/** Reset singleton (for tests). */
export function resetCrossEncoder(): void {
  singleton = null;
  loadAttempted = false;
  loadError = null;
}
