// BGE-M3 sparse (lexical weights) embedder — ADR-382.
//
// bge-m3's native sparse retrieval comes from its masked-LM head (BAAI
// FlagEmbedding semantics): for each input token position, the weight is
// ReLU(max over the 250k-vocab of the MLM logits). Sparse vectors are
// {tokenId → weight} maps whose dot product is the lexical similarity.
//
// The extraction math is a pure, unit-testable function; the model wrapper
// maps token positions → vocab ids (merge duplicates by max weight) and
// respects the attention mask. Batch processing is intentionally batch=1:
// a single 512-token doc produces ~512MB of fp32 logits (250002 vocab);
// batching would blow memory.
//
// Sparse is m3-only: getBgeSparseEmbedder returns null for any model whose
// registry spec has sparse: false.

import {
  resolveEmbeddingModel,
  type EmbeddingModelSpec,
} from './embedding-models.js';
import { loadTransformersClasses, type TransformersClasses } from './bge-embedder.js';

/** tokenId → weight */
export type SparseVector = Map<number, number>;
/** decoded token string → weight (portable across tokenizer versions) */
export type SparseVectorByToken = Map<string, number>;

export interface SparseEmbedder {
  embed(text: string): Promise<SparseVector>;
  embedBatch(texts: string[]): Promise<SparseVector[]>;
  decode(sparse: SparseVector): SparseVectorByToken;
  modelName(): string;
}

/**
 * Extract per-position sparse weights from MLM logits (BAAI semantics):
 *   w_t = ReLU(max_vocab(logits[batch, t, :]))
 *
 * Pure function — no model or tokenizer needed, so it is unit-testable
 * with synthetic tensors.
 *
 * @param logits   flat MLM-head logits (Float32Array or ArrayLike)
 * @param dims     [batch, seq, vocab] shape of `logits`
 * @param batchIndex  which batch row to extract (default 0)
 * @param opts.relu       apply ReLU (default true)
 * @param opts.floor      drop weights below this value (after ReLU)
 * @param opts.maxTokens  keep only the top-k positions by weight
 * @param opts.mask       attention mask (1 = real token, 0 = padding);
 *                        masked positions get weight 0
 */
export function extractSparseWeights(
  logits: ArrayLike<number>,
  dims: number[],
  batchIndex = 0,
  opts: { relu?: boolean; floor?: number; maxTokens?: number; mask?: ArrayLike<number> } = {},
): SparseVector {
  const [batch, seq, vocab] = dims;
  if (batchIndex < 0 || batchIndex >= batch) {
    throw new Error(`batchIndex ${batchIndex} out of range for batch size ${batch}`);
  }
  const relu = opts.relu ?? true;
  const rowStart = batchIndex * seq * vocab;
  const out = new Map<number, number>();
  for (let t = 0; t < seq; t++) {
    if (opts.mask && (opts.mask[t] ?? 1) === 0) continue;
    let w = -Infinity;
    const base = rowStart + t * vocab;
    for (let v = 0; v < vocab; v++) {
      const x = logits[base + v];
      if (x > w) w = x;
    }
    if (relu && w <= 0) continue;
    if (opts.floor !== undefined && w < opts.floor) continue;
    out.set(t, w);
  }
  if (opts.maxTokens && out.size > opts.maxTokens) {
    const ranked = [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.maxTokens);
    out.clear();
    for (const [pos, w] of ranked) out.set(pos, w);
  }
  return out;
}

/**
 * Map position-keyed weights onto tokenizer vocab ids. Duplicate ids
 * (same token appearing twice) merge by max weight — BAAI's sparse
 * vectors are per-vocab-id.
 */
export function toSparse(inputIds: ArrayLike<number>, weights: SparseVector): SparseVector {
  const out = new Map<number, number>();
  for (const [pos, w] of weights) {
    const id = inputIds[pos];
    if (id === undefined) continue;
    const prev = out.get(id);
    if (prev === undefined || w > prev) out.set(id, w);
  }
  return out;
}

/** Dot product over token-id-keyed sparse vectors. */
export function sparseDotProduct(a: SparseVector, b: SparseVector): number {
  let sum = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [id, w] of small) {
    const other = large.get(id);
    if (other !== undefined) sum += w * other;
  }
  return sum;
}

/** Dot product over token-string-keyed sparse vectors (cache-friendly). */
export function sparseDotByToken(a: SparseVectorByToken, b: SparseVectorByToken): number {
  let sum = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [token, w] of small) {
    const other = large.get(token);
    if (other !== undefined) sum += w * other;
  }
  return sum;
}

interface SparseState {
  embedder: SparseEmbedder | null;
  attempted: boolean;
  error: string | null;
}
const sparseStates = new Map<string, SparseState>();
let lastRequested: string | null = null;

function stateFor(modelName: string): SparseState {
  let s = sparseStates.get(modelName);
  if (!s) {
    s = { embedder: null, attempted: false, error: null };
    sparseStates.set(modelName, s);
  }
  return s;
}

/**
 * Lazy-load the bge-m3 sparse embedder. Returns null when the model is not
 * sparse-capable (registry gate), the MaskedLM class is unavailable, or the
 * load fails. One-shot per model name, like getBgeEmbedder.
 */
export async function getBgeSparseEmbedder(
  modelName = 'Xenova/bge-m3',
): Promise<SparseEmbedder | null> {
  lastRequested = modelName;
  const state = stateFor(modelName);
  if (state.embedder) return state.embedder;
  if (state.attempted && state.error) return null;
  state.attempted = true;

  const spec = resolveEmbeddingModel(modelName);
  if (!spec.sparse) {
    state.error = `${modelName} has no native sparse retrieval (registry sparse: false)`;
    return null;
  }

  try {
    const classes: TransformersClasses | null = await loadTransformersClasses();
    if (!classes?.AutoModelForMaskedLM) {
      state.error =
        'AutoModelForMaskedLM unavailable — the Xenova/bge-m3 repo must ship a masked-LM ONNX variant';
      return null;
    }
    const tokenizer = await classes.AutoTokenizer.from_pretrained(modelName, { quantized: true });
    const model = await classes.AutoModelForMaskedLM.from_pretrained(modelName, { quantized: true });
    state.embedder = buildSparseEmbedder(modelName, spec, tokenizer, model);
    return state.embedder;
  } catch (err: unknown) {
    state.error = err instanceof Error ? err.message : String(err);
    return null;
  }
}

function buildSparseEmbedder(
  modelName: string,
  spec: EmbeddingModelSpec,
  tokenizer: any,
  model: any,
): SparseEmbedder {
  async function encodeOne(text: string): Promise<SparseVector> {
    const inputs = await tokenizer(text, {
      padding: true,
      truncation: true,
      max_length: spec.maxSeqLength,
    });
    const out = await model(inputs);
    const logits = out.logits;
    const data = logits.data as ArrayLike<number>;
    const dims = logits.dims as number[];
    const mask = inputs.attention_mask as ArrayLike<number> | undefined;
    const byPosition = extractSparseWeights(data, dims, 0, { mask });
    return toSparse(inputs.input_ids as ArrayLike<number>, byPosition);
  }

  return {
    async embed(text: string): Promise<SparseVector> {
      return encodeOne(text);
    },
    async embedBatch(texts: string[]): Promise<SparseVector[]> {
      // batch=1 by design — 250k-vocab logits are ~512MB per 512-token doc.
      const results: SparseVector[] = [];
      for (const t of texts) results.push(await encodeOne(t));
      return results;
    },
    decode(sparse: SparseVector): SparseVectorByToken {
      const ids = [...sparse.keys()];
      const tokens = tokenizer.convert_ids_to_tokens(ids) as string[];
      const out = new Map<string, number>();
      ids.forEach((id, i) => {
        const prev = out.get(tokens[i]);
        const w = sparse.get(id) ?? 0;
        if (prev === undefined || w > prev) out.set(tokens[i], w);
      });
      return out;
    },
    modelName(): string {
      return modelName;
    },
  };
}

/** Reset all per-model sparse state (test hook, mirrors resetCrossEncoder). */
export function resetSparseEmbedder(): void {
  sparseStates.clear();
  lastRequested = null;
}

export function getSparseStatus(modelName?: string): {
  loaded: boolean;
  attempted: boolean;
  error: string | null;
  modelName: string | null;
} {
  const name = modelName ?? lastRequested ?? 'Xenova/bge-m3';
  const state = sparseStates.get(name);
  if (!state) return { loaded: false, attempted: false, error: null, modelName: name };
  return {
    loaded: !!state.embedder,
    attempted: state.attempted,
    error: state.error,
    modelName: state.embedder?.modelName() ?? name,
  };
}
