// Production embedding-model hook + dimension guards (ADR-382).
//
// Every provider is mocked (bridge disabled via env, transformers fake,
// ruvector/agentic-flow throwing), so no network or model download happens.
// Since 2026-08-17 the DEFAULT model is bge-m3 (1024-dim): the default path
// must route through the BGE branch, not the MiniLM pipeline branch.

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  assertDimensionCompatible,
  dimensionMismatchError,
  resolveConfiguredEmbedding,
} from '../src/memory/embedding-guard.js';

const PREV = {
  model: process.env.CLAUDE_FLOW_EMBEDDING_MODEL,
  dim: process.env.CLAUDE_FLOW_EMBEDDING_DIMENSION,
  bridge: process.env.CLAUDE_FLOW_DISABLE_BRIDGE,
};

function makeFakeHf(opts: { dimsForName?: (name: string) => number } = {}) {
  const pipelineEmbedder = async () => ({ data: new Float32Array(384) });

  const tokenizer: any = async () => ({ input_ids: [1, 2, 3] });
  tokenizer.from_pretrained = async () => tokenizer;

  const model: any = async () => {
    const dim = model.lastLoadedName?.includes('m3') ? 1024 : 768;
    return { last_hidden_state: { data: new Float32Array(dim), dims: [1, 1, dim] } };
  };
  model.from_pretrained = async (name: string) => {
    model.lastLoadedName = name;
    return model;
  };

  return {
    pipeline: async () => pipelineEmbedder,
    AutoTokenizer: tokenizer,
    AutoModel: model,
  };
}

const throwingFactory = () => {
  throw new Error('unavailable in test');
};

function mockProviders(hfFactory: () => any) {
  vi.doMock('@huggingface/transformers', hfFactory);
  vi.doMock('@xenova/transformers', throwingFactory);
  vi.doMock('ruvector', throwingFactory);
  vi.doMock('agentic-flow', throwingFactory);
  vi.doMock('agentic-flow/reasoningbank', throwingFactory);
}

afterEach(() => {
  vi.doUnmock('@huggingface/transformers');
  vi.doUnmock('@xenova/transformers');
  vi.doUnmock('ruvector');
  vi.doUnmock('agentic-flow');
  vi.doUnmock('agentic-flow/reasoningbank');
  vi.resetModules();
  for (const [key, value] of Object.entries(PREV)) {
    const envKey = key === 'model' ? 'CLAUDE_FLOW_EMBEDDING_MODEL'
      : key === 'dim' ? 'CLAUDE_FLOW_EMBEDDING_DIMENSION'
      : 'CLAUDE_FLOW_DISABLE_BRIDGE';
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
});

describe('loadEmbeddingModel — default path (bge-m3 1024)', () => {
  it('default call loads bge-m3 at 1024 via the BGE branch', async () => {
    process.env.CLAUDE_FLOW_DISABLE_BRIDGE = '1';
    mockProviders(() => makeFakeHf());

    const { loadEmbeddingModel } = await import('../src/memory/memory-initializer.js');
    const result = await loadEmbeddingModel();
    expect(result.success).toBe(true);
    expect(result.dimensions).toBe(1024);
    expect(result.modelName).toBe('Xenova/bge-m3');
  });

  it('repeat default call hits the cache (modelName=cached)', async () => {
    process.env.CLAUDE_FLOW_DISABLE_BRIDGE = '1';
    mockProviders(() => makeFakeHf());

    const { loadEmbeddingModel } = await import('../src/memory/memory-initializer.js');
    await loadEmbeddingModel();
    const second = await loadEmbeddingModel();
    expect(second.modelName).toBe('cached');
    expect(second.dimensions).toBe(1024);
  });
});

describe('loadEmbeddingModel — BGE hook (ADR-382)', () => {
  it('explicit bge-m3 routes through the BGE embedder at 1024-dim', async () => {
    process.env.CLAUDE_FLOW_DISABLE_BRIDGE = '1';
    mockProviders(() => makeFakeHf());

    const { loadEmbeddingModel } = await import('../src/memory/memory-initializer.js');
    const result = await loadEmbeddingModel({ modelName: 'Xenova/bge-m3' });
    expect(result.success).toBe(true);
    expect(result.dimensions).toBe(1024);
    expect(result.modelName).toBe('Xenova/bge-m3');
  });

  it('switching models reloads instead of returning stale cached state', async () => {
    process.env.CLAUDE_FLOW_DISABLE_BRIDGE = '1';
    mockProviders(() => makeFakeHf());

    const { loadEmbeddingModel } = await import('../src/memory/memory-initializer.js');
    await loadEmbeddingModel(); // default bge-m3 1024
    const switched = await loadEmbeddingModel({ modelName: 'Xenova/bge-base-en-v1.5' });
    expect(switched.modelName).not.toBe('cached');
    expect(switched.dimensions).toBe(768);
  });

  it('CLAUDE_FLOW_EMBEDDING_MODEL env drives the load without options', async () => {
    process.env.CLAUDE_FLOW_DISABLE_BRIDGE = '1';
    process.env.CLAUDE_FLOW_EMBEDDING_MODEL = 'Xenova/bge-m3';
    mockProviders(() => makeFakeHf());

    const { loadEmbeddingModel } = await import('../src/memory/memory-initializer.js');
    const result = await loadEmbeddingModel();
    expect(result.success).toBe(true);
    expect(result.dimensions).toBe(1024);
    expect(result.modelName).toBe('Xenova/bge-m3');
  });

  it('fails loudly when a configured BGE model cannot load', async () => {
    process.env.CLAUDE_FLOW_DISABLE_BRIDGE = '1';
    // HF has pipeline (default branch) but NO AutoTokenizer/AutoModel —
    // safeProp yields undefined, so the BGE branch degrades.
    vi.doMock('@huggingface/transformers', () => ({ pipeline: async () => async () => ({}) }));
    vi.doMock('@xenova/transformers', throwingFactory);
    vi.doMock('ruvector', throwingFactory);
    vi.doMock('agentic-flow', throwingFactory);
    vi.doMock('agentic-flow/reasoningbank', throwingFactory);

    const { loadEmbeddingModel } = await import('../src/memory/memory-initializer.js');
    const result = await loadEmbeddingModel({ modelName: 'Xenova/bge-m3' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/BGE embedder failed to load/);
  });

  it('refuses multimodal bge-vl with a clear error instead of a text load', async () => {
    process.env.CLAUDE_FLOW_DISABLE_BRIDGE = '1';
    mockProviders(() => makeFakeHf());

    const { loadEmbeddingModel } = await import('../src/memory/memory-initializer.js');
    const result = await loadEmbeddingModel({ modelName: 'BAAI/bge-vl-large' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/multimodal \(vision-language\)/);
    expect(result.error).toContain('CLAUDE_FLOW_EMBEDDING_MODEL');
  });
});

describe('loadEmbeddingModel — dimension guard (layer 1)', () => {
  it('rejects a branch whose dims differ from the explicit dimension', async () => {
    process.env.CLAUDE_FLOW_DISABLE_BRIDGE = '1';
    mockProviders(() => makeFakeHf());

    const { loadEmbeddingModel } = await import('../src/memory/memory-initializer.js');
    const result = await loadEmbeddingModel({ modelName: 'Xenova/bge-m3', dimension: 768 });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Dimension mismatch/);
  });
});

describe('embedding-guard pure functions', () => {
  it('assertDimensionCompatible allows unknown (legacy) stores', () => {
    expect(assertDimensionCompatible(undefined, 1024, 'Xenova/bge-m3').ok).toBe(true);
    expect(assertDimensionCompatible({}, 1024, 'Xenova/bge-m3').ok).toBe(true);
  });

  it('assertDimensionCompatible allows matching dims and rejects mismatches', () => {
    expect(assertDimensionCompatible({ dimensions: 1024 }, 1024, 'Xenova/bge-m3').ok).toBe(true);
    const bad = assertDimensionCompatible({ dimensions: 384 }, 1024, 'Xenova/bge-m3');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/memory init --force/);
  });

  it('dimensionMismatchError names both spaces and the rebuild command', () => {
    const err = dimensionMismatchError('Xenova/bge-m3', 1024, 384);
    expect(err).toContain('384-dim');
    expect(err).toContain('1024-dim');
    expect(err).toContain('claude-flow memory init --force');
    expect(err).toContain('CLAUDE_FLOW_EMBEDDING_MODEL');
  });

  it('resolveConfiguredEmbedding: env > json > default, env dim wins', () => {
    const def = resolveConfiguredEmbedding({}, '/nonexistent-dir');
    expect(def.model).toBe('Xenova/bge-m3');
    expect(def.dimensions).toBe(1024);
    expect(resolveConfiguredEmbedding({ CLAUDE_FLOW_EMBEDDING_MODEL: 'bge-m3' }, '/x').model).toBe('Xenova/bge-m3');
    expect(resolveConfiguredEmbedding({ CLAUDE_FLOW_EMBEDDING_MODEL: 'bge-m3' }, '/x').dimensions).toBe(1024);
    const dimmed = resolveConfiguredEmbedding(
      { CLAUDE_FLOW_EMBEDDING_MODEL: 'bge-m3', CLAUDE_FLOW_EMBEDDING_DIMENSION: '768' },
      '/x',
    );
    expect(dimmed.dimensions).toBe(768);
  });

  it('resolveConfiguredEmbedding: explicit flag distinguishes config from default', () => {
    expect(resolveConfiguredEmbedding({}, '/nonexistent-dir').explicit).toBe(false);
    expect(resolveConfiguredEmbedding({ CLAUDE_FLOW_EMBEDDING_MODEL: 'Xenova/bge-m3' }, '/x').explicit).toBe(true);
    // ADR-382: even an explicit MiniLM counts as explicit (bypasses bridge).
    expect(
      resolveConfiguredEmbedding({ CLAUDE_FLOW_EMBEDDING_MODEL: 'Xenova/all-MiniLM-L6-v2' }, '/x').explicit,
    ).toBe(true);
    // Empty env value is treated as unset.
    expect(resolveConfiguredEmbedding({ CLAUDE_FLOW_EMBEDDING_MODEL: '' }, '/x').explicit).toBe(false);
  });
});
