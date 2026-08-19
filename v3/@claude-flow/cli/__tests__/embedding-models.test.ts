// Shared embedding-model registry tests (ADR-382).
//
// Pure-function module — no transformers imports, no network. This is the
// single source of truth for per-model config (dims, max length, query
// prefix, sparse availability) consumed by bge-embedder, bge-sparse, and
// the production loadEmbeddingModel hook.

import { describe, it, expect } from 'vitest';
import {
  EMBEDDING_MODELS,
  resolveEmbeddingModel,
  isBgeFamily,
  BGE_QUERY_PREFIX,
  BGE_ZH_QUERY_PREFIX,
  DEFAULT_EMBEDDING_MODEL,
  BRIDGE_EMBEDDING_MODEL,
} from '../src/memory/embedding-models.js';

describe('EMBEDDING_MODELS registry', () => {
  it('bge-m3: 1024-dim, 8192 max seq, instruction-free, sparse enabled', () => {
    const m3 = EMBEDDING_MODELS['Xenova/bge-m3'];
    expect(m3).toBeDefined();
    expect(m3.dim).toBe(1024);
    expect(m3.maxSeqLength).toBe(8192);
    expect(m3.pooling).toBe('cls');
    expect(m3.queryPrefix).toBeNull();
    expect(m3.family).toBe('bge-m3');
    expect(m3.sparse).toBe(true);
    expect(m3.sparseWeight).toBe(0.3);
    expect(m3.denseWeight).toBe(1.0);
  });

  it('bge-en-v1.5 trio: correct dims and English query prefix', () => {
    expect(EMBEDDING_MODELS['Xenova/bge-small-en-v1.5'].dim).toBe(384);
    expect(EMBEDDING_MODELS['Xenova/bge-base-en-v1.5'].dim).toBe(768);
    expect(EMBEDDING_MODELS['Xenova/bge-large-en-v1.5'].dim).toBe(1024);
    for (const id of [
      'Xenova/bge-small-en-v1.5',
      'Xenova/bge-base-en-v1.5',
      'Xenova/bge-large-en-v1.5',
    ]) {
      const spec = EMBEDDING_MODELS[id];
      expect(spec.queryPrefix).toBe(BGE_QUERY_PREFIX);
      expect(spec.maxSeqLength).toBe(512);
      expect(spec.sparse).toBe(false);
      expect(spec.family).toBe('bge-en-v1.5');
    }
  });

  it('bge-large-zh-v1.5: 1024-dim with Chinese query prefix', () => {
    const zh = EMBEDDING_MODELS['Xenova/bge-large-zh-v1.5'];
    expect(zh.dim).toBe(1024);
    expect(zh.queryPrefix).toBe(BGE_ZH_QUERY_PREFIX);
    expect(zh.family).toBe('bge-zh-v1.5');
    expect(zh.sparse).toBe(false);
  });

  it('bge-vl family: multimodal CLIP-style models registered with aliases', () => {
    for (const id of ['BAAI/bge-vl-base', 'BAAI/bge-vl-large']) {
      const spec = EMBEDDING_MODELS[id];
      expect(spec).toBeDefined();
      expect(spec.family).toBe('bge-vl');
      expect(spec.multimodal).toBe(true);
      expect(spec.sparse).toBe(false);
      expect(spec.queryPrefix).toBeNull();
    }
    expect(EMBEDDING_MODELS['BAAI/bge-vl-large'].dim).toBe(768);
    expect(resolveEmbeddingModel('bge-vl-large').modelId).toBe('BAAI/bge-vl-large');
    expect(resolveEmbeddingModel('bge-vl-base').modelId).toBe('BAAI/bge-vl-base');
  });

  it('DEFAULT_EMBEDDING_MODEL is bge-m3 (1024-dim, sparse, instruction-free)', () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe('Xenova/bge-m3');
    const m3 = EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL];
    expect(m3.dim).toBe(1024);
    expect(m3.sparse).toBe(true);
    expect(m3.queryPrefix).toBeNull();
  });

  it('bridge model MiniLM: 384-dim, mean pooling, no prefix', () => {
    const minilm = EMBEDDING_MODELS[BRIDGE_EMBEDDING_MODEL];
    expect(minilm.dim).toBe(384);
    expect(minilm.pooling).toBe('mean');
    expect(minilm.queryPrefix).toBeNull();
    expect(minilm.family).toBe('minilm');
  });

  it('legacy BGE_QUERY_PREFIX literal is unchanged (byte-compat)', () => {
    expect(BGE_QUERY_PREFIX).toBe(
      'Represent this sentence for searching relevant passages: '
    );
  });
});

describe('resolveEmbeddingModel', () => {
  it('exact modelId resolves to the registered spec', () => {
    expect(resolveEmbeddingModel('Xenova/bge-m3').dim).toBe(1024);
    expect(resolveEmbeddingModel('Xenova/bge-base-en-v1.5').dim).toBe(768);
  });

  it('short-ID aliases resolve (embeddings.json / CLI flag style)', () => {
    expect(resolveEmbeddingModel('bge-m3').modelId).toBe('Xenova/bge-m3');
    expect(resolveEmbeddingModel('BGE-M3').dim).toBe(1024);
    expect(resolveEmbeddingModel('all-minilm-l6-v2').family).toBe('minilm');
    expect(resolveEmbeddingModel('all-MiniLM-L6-v2').dim).toBe(384);
  });

  it('substring heuristic preserves legacy dim() behavior for unknown models', () => {
    expect(resolveEmbeddingModel('Xenova/unknown-small-model').dim).toBe(384);
    expect(resolveEmbeddingModel('Xenova/unknown-large-model').dim).toBe(1024);
    expect(resolveEmbeddingModel('Xenova/some-unregistered-model').dim).toBe(768);
    const unknown = resolveEmbeddingModel('Xenova/some-unregistered-model');
    expect(unknown.family).toBe('other');
    expect(unknown.queryPrefix).toBeNull();
    expect(unknown.sparse).toBe(false);
    expect(unknown.maxSeqLength).toBe(512);
  });
});

describe('isBgeFamily', () => {
  it('true for all bge-* families, false otherwise', () => {
    expect(isBgeFamily(EMBEDDING_MODELS['Xenova/bge-m3'])).toBe(true);
    expect(isBgeFamily(EMBEDDING_MODELS['Xenova/bge-large-zh-v1.5'])).toBe(true);
    expect(isBgeFamily(EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL])).toBe(true);
    expect(isBgeFamily(EMBEDDING_MODELS[BRIDGE_EMBEDDING_MODEL])).toBe(false);
    expect(isBgeFamily(resolveEmbeddingModel('Xenova/some-unregistered-model'))).toBe(false);
  });
});
