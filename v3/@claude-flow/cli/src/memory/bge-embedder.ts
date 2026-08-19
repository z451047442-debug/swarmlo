// BGE bi-encoder embedder — direct AutoTokenizer + AutoModel path
// (bypasses agentic-flow's transformers.js which needs sharp and fails
// on darwin-arm64 without libvips).
//
// ADR-382: spec-driven via the shared embedding-models.ts registry.
// Supported models: Xenova/bge-small/base/large-en-v1.5 (384/768/1024-dim),
// Xenova/bge-large-zh-v1.5, and Xenova/bge-m3 (1024-dim, 8192 seq,
// instruction-free). Unregistered models fall back to the legacy name-based
// dim heuristic (small→384, large→1024, else 768).
// BGE-VL (multimodal) is registered in the registry but REFUSED here — the
// text-only pipeline cannot run a vision-language model.
//
// BGE outputs use CLS-token pooling + L2 normalisation (per BAAI's docs).
//
// ADR-085 (BEIR harness) + ADR-086 (BGE embedder) + ADR-090 (query prefix,
// now spec-driven — bge-m3 is instruction-free and gets no prefix).

import {
  resolveEmbeddingModel,
  BGE_QUERY_PREFIX,
  type EmbeddingModelSpec,
} from './embedding-models.js';
import { createRequire } from 'node:module';

export { BGE_QUERY_PREFIX };

type Embedder = {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  /** ADR-090: applies the spec's query prefix (if any) — BAAI says the
   *  en-v1.5 prefix helps queries but hurts documents. bge-m3 is
   *  instruction-free, so embedQuery === embed for it. */
  embedQuery(text: string): Promise<Float32Array>;
  dim(): number;
  modelName(): string;
};

/** Auto classes shared with bge-sparse.ts and cross-encoder-rerank.ts (ADR-382). */
export type TransformersClasses = {
  AutoTokenizer: any;
  AutoModel: any;
  AutoModelForMaskedLM?: any;
  AutoModelForSequenceClassification?: any;
  source: '@huggingface/transformers' | '@xenova/transformers';
};

/**
 * Read a module export without tripping vitest's mock wrapper, which
 * THROWS when a property the mock factory never returned is accessed
 * (real ESM modules just yield undefined). This keeps the loader robust
 * under partial mocks as well as against package variants.
 */
function safeProp<T>(mod: any, prop: string): T | undefined {
  try {
    return mod?.[prop] as T | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Apply an HF endpoint override (ADR-382 follow-up): `CLAUDE_FLOW_HF_ENDPOINT`
 * or `HF_ENDPOINT` points the loader at a model mirror (e.g. hf-mirror.com)
 * before any from_pretrained() call. Must run before model loading.
 */
export function applyHfEndpoint(mod: any): void {
  const endpoint = process.env.CLAUDE_FLOW_HF_ENDPOINT || process.env.HF_ENDPOINT;
  if (endpoint && mod?.env && typeof mod.env === 'object') {
    try {
      mod.env.remoteHost = endpoint;
      mod.env.allowRemoteModels = true;
    } catch {
      // env not writable — model fetch will use the default host.
    }
  }
}

/**
 * ADR-094 pattern: prefer the maintained @huggingface/transformers (v3,
 * which current Xenova repos target), fall back to the legacy
 * @xenova/transformers. Indirect imports keep both runtime-optional.
 */
export async function loadTransformersClasses(): Promise<TransformersClasses | null> {
  // 2026-08-17: @huggingface/transformers v4's ESM entry can fail to LOAD on
  // some Node builds ("Named export 'Tensor' not found" — onnxruntime-common
  // CJS interop), while its CJS entry (transformers.node.cjs) works. Keep the
  // dynamic import FIRST (vitest mocks intercept it), fall back to a CJS
  // require of the same package when the ESM entry throws.
  // Vitest sets VITEST=1 in workers; its mocks cannot intercept a native
  // createRequire, so disable the fallback there (tests assert the mocked
  // import path only).
  const requireHf = (() => {
    if (process.env.VITEST) return null;
    try {
      return createRequire(import.meta.url);
    } catch {
      return null;
    }
  })();

  const tryLoad = async (specifier: string): Promise<any> => {
    try {
      const mod = await import(/* @vite-ignore */ specifier);
      applyHfEndpoint(mod);
      return mod;
    } catch {
      if (specifier === '@huggingface/transformers' && requireHf) {
        try {
          const mod = requireHf(specifier);
          applyHfEndpoint(mod);
          return mod;
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  const hf = await tryLoad('@huggingface/transformers');
  if (safeProp(hf, 'AutoTokenizer') && safeProp(hf, 'AutoModel')) {
    return {
      AutoTokenizer: safeProp(hf, 'AutoTokenizer'),
      AutoModel: safeProp(hf, 'AutoModel'),
      AutoModelForMaskedLM: safeProp(hf, 'AutoModelForMaskedLM'),
      AutoModelForSequenceClassification: safeProp(hf, 'AutoModelForSequenceClassification'),
      source: '@huggingface/transformers',
    };
  }

  const xen = await tryLoad('@xenova/transformers');
  if (safeProp(xen, 'AutoTokenizer') && safeProp(xen, 'AutoModel')) {
    return {
      AutoTokenizer: safeProp(xen, 'AutoTokenizer'),
      AutoModel: safeProp(xen, 'AutoModel'),
      AutoModelForMaskedLM: safeProp(xen, 'AutoModelForMaskedLM'),
      AutoModelForSequenceClassification: safeProp(xen, 'AutoModelForSequenceClassification'),
      source: '@xenova/transformers',
    };
  }
  return null;
}

// Per-model load state. A failed load for one model must not poison other
// models (ADR-382 — previously a single singleton + global loadAttempted
// flag meant an m3 failure would block the default base-en load too).
interface ModelState {
  embedder: Embedder | null;
  attempted: boolean;
  error: string | null;
}
const modelStates = new Map<string, ModelState>();
let lastRequested: string | null = null;

function stateFor(modelName: string): ModelState {
  let s = modelStates.get(modelName);
  if (!s) {
    s = { embedder: null, attempted: false, error: null };
    modelStates.set(modelName, s);
  }
  return s;
}

/**
 * Lazy-load the BGE bi-encoder. Defaults to Xenova/bge-base-en-v1.5.
 * Returns null on failure; caller should fall back. One-shot per model
 * name: a failed load is remembered and not retried.
 */
export async function getBgeEmbedder(modelName = 'Xenova/bge-base-en-v1.5'): Promise<Embedder | null> {
  lastRequested = modelName;
  const state = stateFor(modelName);
  if (state.embedder) return state.embedder;
  if (state.attempted && state.error) return null;
  state.attempted = true;

  try {
    const classes = await loadTransformersClasses();
    if (!classes) {
      state.error = 'neither @huggingface/transformers nor @xenova/transformers is available';
      return null;
    }
    const spec = resolveEmbeddingModel(modelName);
    // BGE-VL (multimodal) is registered but refused here — defense-in-depth
    // for direct callers (BEIR scripts can pass BGE_MODEL=BAAI/bge-vl-*).
    if (spec.multimodal) {
      state.error =
        `${modelName} is a multimodal (vision-language) model — the text-only ` +
        'ONNX pipeline cannot load it (no ONNX export; requires image input + remote code). ' +
        'Use the BGE-VL sidecar instead: `npx swarmlo bge-vl embed --text "..."` (ADR-384).';
      return null;
    }
    const tokenizer = await classes.AutoTokenizer.from_pretrained(modelName, { quantized: true });
    const model = await classes.AutoModel.from_pretrained(modelName, { quantized: true });
    state.embedder = buildEmbedder(modelName, spec, tokenizer, model);
    return state.embedder;
  } catch (err: unknown) {
    state.error = err instanceof Error ? err.message : String(err);
    return null;
  }
}

function buildEmbedder(
  modelName: string,
  spec: EmbeddingModelSpec,
  tokenizer: any,
  model: any,
): Embedder {
  // BGE uses CLS pooling + L2 normalisation per the BAAI README.
  // We do both manually since the lower-level API doesn't apply them.
  function clsPool(out: any): Float32Array {
    // last_hidden_state shape: [batch, seq_len, hidden_dim]
    const hidden = out.last_hidden_state ?? out.hiddenState ?? out[0];
    const data = hidden.data as Float32Array;
    const dims = hidden.dims as number[]; // [batch, seq, hidden]
    const [b, _seq, h] = dims;
    // CLS is position 0 of each batch row.
    const result = new Float32Array(b * h);
    for (let bi = 0; bi < b; bi++) {
      for (let hi = 0; hi < h; hi++) {
        // hidden[bi, 0, hi] = data[(bi * seq + 0) * h + hi]
        result[bi * h + hi] = data[(bi * _seq + 0) * h + hi];
      }
    }
    return result;
  }

  function l2norm(vec: Float32Array, offset: number, len: number): void {
    let n = 0;
    for (let i = 0; i < len; i++) n += vec[offset + i] * vec[offset + i];
    n = Math.sqrt(n);
    if (n > 1e-9) for (let i = 0; i < len; i++) vec[offset + i] /= n;
  }

  // ADR-382: real hidden dim backfilled from the first embed output. The
  // registry dim is authoritative until then (fixes the old name-guessing
  // dim() that returned 768 for bge-m3).
  let actualDim: number | null = null;

  async function encodeRaw(texts: string | string[]): Promise<Float32Array> {
    const inputs = await tokenizer(texts, {
      padding: true,
      truncation: true,
      max_length: spec.maxSeqLength,
    });
    const out = await model(inputs);
    const pooled = clsPool(out);
    const batch = Array.isArray(texts) ? texts.length : 1;
    const h = pooled.length / batch;
    actualDim ??= h;
    return pooled;
  }

  return {
    async embed(text: string): Promise<Float32Array> {
      const pooled = await encodeRaw(text);
      l2norm(pooled, 0, pooled.length);
      return pooled;
    },
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const pooled = await encodeRaw(texts);
      const h = pooled.length / texts.length;
      const results: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) {
        const vec = pooled.slice(i * h, (i + 1) * h);
        l2norm(vec, 0, h);
        results.push(vec);
      }
      return results;
    },
    async embedQuery(text: string): Promise<Float32Array> {
      // ADR-090: prepend the spec's query prefix (en-v1.5 English
      // instruction, zh-v1.5 Chinese instruction). Measured +0.009
      // nDCG@10 on NFCorpus dense-alone for the en prefix. bge-m3 is
      // instruction-free — spec.queryPrefix is null, so no prefix.
      const input = spec.queryPrefix ? spec.queryPrefix + text : text;
      const pooled = await encodeRaw(input);
      l2norm(pooled, 0, pooled.length);
      return pooled;
    },
    dim(): number {
      return actualDim ?? spec.dim;
    },
    modelName(): string {
      return modelName;
    },
  };
}

/** Reset all per-model state (test hook, mirrors resetCrossEncoder). */
export function resetBgeEmbedder(): void {
  modelStates.clear();
  lastRequested = null;
}

export function getBgeStatus(modelName?: string): {
  loaded: boolean;
  attempted: boolean;
  error: string | null;
  modelName: string | null;
} {
  const name = modelName ?? lastRequested ?? 'Xenova/bge-base-en-v1.5';
  const state = modelStates.get(name);
  if (!state) return { loaded: false, attempted: false, error: null, modelName: name };
  return {
    loaded: !!state.embedder,
    attempted: state.attempted,
    error: state.error,
    modelName: state.embedder?.modelName() ?? name,
  };
}
