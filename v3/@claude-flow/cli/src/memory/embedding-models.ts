// Shared embedding-model registry (ADR-382).
//
// Single source of truth for per-model embedding config consumed by:
//   - bge-embedder.ts        (dense bi-encoder path, CLS pooling)
//   - bge-sparse.ts          (bge-m3 MLM-head sparse path)
//   - memory-initializer.ts  (production loadEmbeddingModel hook)
//
// Resolution order: exact modelId → short-ID alias (embeddings.json style)
// → substring heuristic. The heuristic preserves the legacy dim() name-
// guessing behavior of bge-embedder.ts for unregistered models.

export const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
export const BGE_ZH_QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';

/** System default embedding model (ADR-382, revised 2026-08-17: bge-m3). */
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/bge-m3';
/** The model the AgentDB bridge serves (hardcoded upstream as MiniLM). */
export const BRIDGE_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

export type EmbeddingFamily =
  | 'bge-en-v1.5'
  | 'bge-zh-v1.5'
  | 'bge-m3'
  | 'bge-vl'
  | 'minilm'
  | 'mpnet'
  | 'other';

export interface EmbeddingModelSpec {
  modelId: string;
  /** Dense embedding dimension. */
  dim: number;
  /** Tokenizer truncation limit used by the embedder. */
  maxSeqLength: number;
  pooling: 'cls' | 'mean';
  /** L2-normalise dense vectors. */
  normalize: boolean;
  /** Query-side instruction prefix; null = instruction-free (bge-m3, MiniLM). */
  queryPrefix: string | null;
  family: EmbeddingFamily;
  /** Native MLM-head sparse retrieval available (bge-m3 only). */
  sparse: boolean;
  /** BAAI fusion recipe: dense:sparse = 1:0.3. */
  sparseWeight?: number;
  denseWeight?: number;
  /**
   * Multimodal (vision-language) model — e.g. the BGE-VL family. The
   * text-only ONNX pipeline (bge-embedder.ts) cannot load these (no ONNX
   * export, custom remote code, image processor required), so
   * loadEmbeddingModel refuses them loudly instead of attempting a text-only
   * load that would yield wrong-pooling vectors or a confusing failure.
   * The working pipeline lives in the swarmlo-bge-vl plugin (Python
   * sidecar, isolated bge-vl.db) — see ADR-384. Loaders refuse with a
   * pointer to `npx swarmlo bge-vl embed`.
   */
  multimodal?: boolean;
  /**
   * Default semantic-search threshold for this model's dense space.
   * bge-m3's dense cosine distribution is looser than MiniLM's — related
   * pairs measured 0.17–0.22 vs 0.3+ for MiniLM — so m3 needs a lower
   * default. Undefined = the 0.3 legacy default.
   */
  defaultThreshold?: number;
}

function bgeEn(modelId: string, dim: number): EmbeddingModelSpec {
  return {
    modelId,
    dim,
    maxSeqLength: 512,
    pooling: 'cls',
    normalize: true,
    queryPrefix: BGE_QUERY_PREFIX,
    family: 'bge-en-v1.5',
    sparse: false,
  };
}

export const EMBEDDING_MODELS: Readonly<Record<string, EmbeddingModelSpec>> = {
  'Xenova/bge-m3': {
    modelId: 'Xenova/bge-m3',
    dim: 1024,
    maxSeqLength: 8192,
    pooling: 'cls',
    normalize: true,
    queryPrefix: null, // BAAI: m3 is instruction-free; prefixing would hurt.
    family: 'bge-m3',
    sparse: true,
    sparseWeight: 0.3,
    denseWeight: 1.0,
    defaultThreshold: 0.15, // measured related-pair cosine 0.17–0.22 (2026-08-17)
  },
  // BGE-VL — CLIP-style multimodal (vision-language) family. Registered for
  // name resolution / config only: loads are refused (multimodal), so dim is
  // informational, not verified against a loaded model.
  'BAAI/bge-vl-base': {
    modelId: 'BAAI/bge-vl-base',
    dim: 768, // per BAAI model card — unverified in-tree
    maxSeqLength: 512,
    pooling: 'mean', // CLIP projection, not CLS/mean — unused (loads refused)
    normalize: true,
    queryPrefix: null, // instruction-free CLIP-style dual encoder
    family: 'bge-vl',
    sparse: false,
    multimodal: true,
  },
  'BAAI/bge-vl-large': {
    modelId: 'BAAI/bge-vl-large',
    dim: 768, // verified via HF discussion: get_text_features → (2, 768)
    maxSeqLength: 512,
    pooling: 'mean', // CLIP projection, not CLS/mean — unused (loads refused)
    normalize: true,
    queryPrefix: null, // instruction-free CLIP-style dual encoder
    family: 'bge-vl',
    sparse: false,
    multimodal: true,
  },
  'Xenova/bge-small-en-v1.5': bgeEn('Xenova/bge-small-en-v1.5', 384),
  'Xenova/bge-base-en-v1.5': bgeEn('Xenova/bge-base-en-v1.5', 768),
  'Xenova/bge-large-en-v1.5': bgeEn('Xenova/bge-large-en-v1.5', 1024),
  'Xenova/bge-large-zh-v1.5': {
    modelId: 'Xenova/bge-large-zh-v1.5',
    dim: 1024,
    maxSeqLength: 512,
    pooling: 'cls',
    normalize: true,
    queryPrefix: BGE_ZH_QUERY_PREFIX,
    family: 'bge-zh-v1.5',
    sparse: false,
  },
  'Xenova/all-MiniLM-L6-v2': {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    dim: 384,
    maxSeqLength: 256,
    pooling: 'mean',
    normalize: true,
    queryPrefix: null,
    family: 'minilm',
    sparse: false,
  },
};

/** Short-ID aliases used by `embeddings init` (embeddings.json) and CLI flags. */
const SHORT_IDS: Readonly<Record<string, string>> = {
  'bge-m3': 'Xenova/bge-m3',
  'bge-vl-base': 'BAAI/bge-vl-base',
  'bge-vl-large': 'BAAI/bge-vl-large',
  'bge-small-en-v1.5': 'Xenova/bge-small-en-v1.5',
  'bge-base-en-v1.5': 'Xenova/bge-base-en-v1.5',
  'bge-large-en-v1.5': 'Xenova/bge-large-en-v1.5',
  'bge-large-zh-v1.5': 'Xenova/bge-large-zh-v1.5',
  'all-minilm-l6-v2': 'Xenova/all-MiniLM-L6-v2',
  'all-mpnet-base-v2': 'Xenova/all-mpnet-base-v2',
};

/**
 * Resolve a model reference to its spec. Exact registered ID wins, then
 * short-ID alias (case-insensitive), then the legacy substring heuristic
 * ('small' → 384, 'large' → 1024, otherwise 768) for unregistered models.
 */
export function resolveEmbeddingModel(modelName: string): EmbeddingModelSpec {
  const exact = EMBEDDING_MODELS[modelName];
  if (exact) return exact;
  const short = SHORT_IDS[modelName.toLowerCase()];
  if (short) return EMBEDDING_MODELS[short];

  const lower = modelName.toLowerCase();
  let dim = 768;
  if (lower.includes('small')) dim = 384;
  else if (lower.includes('large')) dim = 1024;
  return {
    modelId: modelName,
    dim,
    maxSeqLength: 512,
    pooling: 'cls',
    normalize: true,
    queryPrefix: null,
    family: 'other',
    sparse: false,
  };
}

export function isBgeFamily(spec: EmbeddingModelSpec): boolean {
  return spec.family.startsWith('bge');
}
