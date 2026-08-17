// BGE embedder — registry-driven behavior + provider selection (ADR-382).
//
// Both transformers packages are mocked with fake AutoTokenizer/AutoModel
// classes returning scripted tensors, so no network or model download is
// needed. The graceful-degradation contract (null on failure, one-shot per
// model) follows the cross-encoder-rerank.test.ts pattern.

import { describe, it, expect, afterEach, vi } from 'vitest';

const BASE_DIM = 768;
const M3_DIM = 1024;

interface FakeTransformers {
  AutoTokenizer: any;
  AutoModel: any;
  /** Texts passed to the tokenizer, in call order. */
  received: { text: string; opts: any }[];
  model: any;
}

function makeFakeTransformers(opts: { failModel?: string } = {}): FakeTransformers {
  const received: { text: string; opts: any }[] = [];
  const tokenizer: any = (text: string | string[], tokOpts?: any) => {
    received.push({ text: Array.isArray(text) ? text.join('\n') : text, opts: tokOpts });
    return { inputIds: [1, 2, 3] };
  };
  tokenizer.from_pretrained = async () => tokenizer;

  const model: any = async (inputs: any) => {
    const dim = model.lastLoadedName?.includes('m3') ? M3_DIM : BASE_DIM;
    return { last_hidden_state: { data: new Float32Array(dim), dims: [1, 1, dim] } };
  };
  model.from_pretrained = async (name: string) => {
    if (opts.failModel && name.includes(opts.failModel)) {
      throw new Error(`simulated load failure: ${name}`);
    }
    model.lastLoadedName = name;
    return model;
  };

  return {
    AutoTokenizer: tokenizer,
    AutoModel: model,
    received,
    model,
    env: { remoteHost: null as string | null, allowRemoteModels: false },
  };
}

const throwingFactory = () => {
  throw new Error('unavailable in test');
};

afterEach(() => {
  vi.doUnmock('@huggingface/transformers');
  vi.doUnmock('@xenova/transformers');
  vi.resetModules();
  delete process.env.CLAUDE_FLOW_HF_ENDPOINT;
  delete process.env.HF_ENDPOINT;
});

describe('bge-embedder — registry-driven behavior', () => {
  it('reports 1024-dim for bge-m3 from the registry, before any embed', async () => {
    const fake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder } = await import('../src/memory/bge-embedder.js');
    const emb = await getBgeEmbedder('Xenova/bge-m3');
    expect(emb).not.toBeNull();
    expect(emb!.dim()).toBe(1024);
    expect(emb!.modelName()).toBe('Xenova/bge-m3');
  });

  it('reports 768-dim for base-en and backfills the real dim after embed', async () => {
    const fake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder } = await import('../src/memory/bge-embedder.js');
    const emb = await getBgeEmbedder('Xenova/bge-base-en-v1.5');
    expect(emb!.dim()).toBe(768);
    const v = await emb!.embed('hello world');
    expect(v.length).toBe(768);
    expect(emb!.dim()).toBe(768);
  });

  it('embedQuery prefixes base-en with the English instruction', async () => {
    const fake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder, BGE_QUERY_PREFIX } = await import('../src/memory/bge-embedder.js');
    const emb = await getBgeEmbedder('Xenova/bge-base-en-v1.5');
    await emb!.embedQuery('search this');
    expect(fake.received[0].text).toBe(BGE_QUERY_PREFIX + 'search this');
  });

  it('embedQuery does NOT prefix bge-m3 (instruction-free)', async () => {
    const fake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder } = await import('../src/memory/bge-embedder.js');
    const emb = await getBgeEmbedder('Xenova/bge-m3');
    await emb!.embedQuery('search this');
    expect(fake.received[0].text).toBe('search this');
  });

  it('embedQuery prefixes zh-v1.5 with the Chinese instruction', async () => {
    const fake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder } = await import('../src/memory/bge-embedder.js');
    const emb = await getBgeEmbedder('Xenova/bge-large-zh-v1.5');
    await emb!.embedQuery('试用期多久');
    expect(fake.received[0].text).toBe('为这个句子生成表示以用于检索相关文章：试用期多久');
  });

  it('keeps the legacy BGE_QUERY_PREFIX export byte-identical', async () => {
    const mod = await import('../src/memory/bge-embedder.js');
    expect(mod.BGE_QUERY_PREFIX).toBe(
      'Represent this sentence for searching relevant passages: '
    );
  });
});

describe('bge-embedder — provider selection', () => {
  it('prefers @huggingface/transformers and never touches xenova when HF works', async () => {
    const hfFake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => hfFake);
    let xenTouched = false;
    vi.doMock('@xenova/transformers', () => {
      xenTouched = true;
      throw new Error('nope');
    });

    const { getBgeEmbedder } = await import('../src/memory/bge-embedder.js');
    const emb = await getBgeEmbedder('Xenova/bge-base-en-v1.5');
    expect(emb).not.toBeNull();
    expect(emb!.dim()).toBe(768);
    expect(xenTouched).toBe(false);
  });

  it('falls back to @xenova/transformers when HF is unavailable', async () => {
    vi.doMock('@huggingface/transformers', throwingFactory);
    const xenFake = makeFakeTransformers();
    vi.doMock('@xenova/transformers', () => xenFake);

    const { getBgeEmbedder } = await import('../src/memory/bge-embedder.js');
    const emb = await getBgeEmbedder('Xenova/bge-base-en-v1.5');
    expect(emb).not.toBeNull();
    expect(emb!.dim()).toBe(768);
  });

  it('returns null when neither package is available', async () => {
    vi.doMock('@huggingface/transformers', throwingFactory);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder, getBgeStatus } = await import('../src/memory/bge-embedder.js');
    const emb = await getBgeEmbedder('Xenova/bge-base-en-v1.5');
    expect(emb).toBeNull();
    const status = getBgeStatus();
    expect(status.attempted).toBe(true);
    expect(status.loaded).toBe(false);
    expect(status.error).toBeTruthy();
  });

  it('applies CLAUDE_FLOW_HF_ENDPOINT to the loaded module env (HF mirror)', async () => {
    process.env.CLAUDE_FLOW_HF_ENDPOINT = 'https://hf-mirror.com';
    const fake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { loadTransformersClasses } = await import('../src/memory/bge-embedder.js');
    const classes = await loadTransformersClasses();
    expect(classes).not.toBeNull();
    expect(fake.env.remoteHost).toBe('https://hf-mirror.com');
    expect(fake.env.allowRemoteModels).toBe(true);
  });

  it('leaves remoteHost untouched when no endpoint env is set', async () => {
    const fake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { loadTransformersClasses } = await import('../src/memory/bge-embedder.js');
    await loadTransformersClasses();
    expect(fake.env.remoteHost).toBeNull();
  });
});

describe('bge-embedder — per-model failure isolation (ADR-382)', () => {
  it('a failed m3 load does not poison the default base-en load', async () => {
    const fake = makeFakeTransformers({ failModel: 'bge-m3' });
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder, getBgeStatus } = await import('../src/memory/bge-embedder.js');
    const m3 = await getBgeEmbedder('Xenova/bge-m3');
    expect(m3).toBeNull();
    const m3Status = getBgeStatus('Xenova/bge-m3');
    expect(m3Status.error).toBeTruthy();

    const base = await getBgeEmbedder('Xenova/bge-base-en-v1.5');
    expect(base).not.toBeNull();
    expect(base!.dim()).toBe(768);
  });

  it('does not retry a failed model (one-shot per model name)', async () => {
    const fake = makeFakeTransformers({ failModel: 'bge-m3' });
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder } = await import('../src/memory/bge-embedder.js');
    await getBgeEmbedder('Xenova/bge-m3');
    const tStart = Date.now();
    const again = await getBgeEmbedder('Xenova/bge-m3');
    expect(again).toBeNull();
    expect(Date.now() - tStart).toBeLessThan(50);
  });

  it('returns the cached embedder on repeat calls without reloading', async () => {
    const fake = makeFakeTransformers();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeEmbedder } = await import('../src/memory/bge-embedder.js');
    const first = await getBgeEmbedder('Xenova/bge-base-en-v1.5');
    const second = await getBgeEmbedder('Xenova/bge-base-en-v1.5');
    expect(second).toBe(first);
  });
});
