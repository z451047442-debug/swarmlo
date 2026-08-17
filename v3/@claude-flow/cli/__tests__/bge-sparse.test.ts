// bge-sparse — extraction math + graceful-degradation contract (ADR-382).
//
// Pure functions (extractSparseWeights, toSparse, dot products) are tested
// against synthetic tensors with exact expectations. The model wrapper is
// tested with mocked transformers classes (no network), following the
// cross-encoder-rerank.test.ts graceful-degradation pattern.

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  extractSparseWeights,
  toSparse,
  sparseDotProduct,
  sparseDotByToken,
} from '../src/memory/bge-sparse.js';

describe('extractSparseWeights — BAAI ReLU-max semantics', () => {
  // Synthetic logits: batch=1, seq=3, vocab=4.
  //   pos 0: [1, -2, 3, 0.5]   → max 3
  //   pos 1: [-1, -5, -2, -4]  → max -1 → ReLU drops
  //   pos 2: [0, 2, -3, 1]     → max 2
  const dims = [1, 3, 4];
  const logits = new Float32Array([
    1, -2, 3, 0.5,
    -1, -5, -2, -4,
    0, 2, -3, 1,
  ]);

  it('extracts ReLU(max_vocab) per position, dropping non-positive', () => {
    const out = extractSparseWeights(logits, dims);
    expect([...out.entries()]).toEqual([[0, 3], [2, 2]]);
  });

  it('floor drops weak positions', () => {
    expect([...extractSparseWeights(logits, dims, 0, { floor: 2.5 }).entries()]).toEqual([[0, 3]]);
    expect(extractSparseWeights(logits, dims, 0, { floor: 4 }).size).toBe(0);
  });

  it('relu: false keeps negative maxima', () => {
    const out = extractSparseWeights(logits, dims, 0, { relu: false });
    expect(out.get(1)).toBe(-1);
  });

  it('maxTokens keeps only the top-k by weight', () => {
    const out = extractSparseWeights(logits, dims, 0, { maxTokens: 1 });
    expect([...out.entries()]).toEqual([[0, 3]]);
  });

  it('attention mask zeroes padded positions', () => {
    const out = extractSparseWeights(logits, dims, 0, { mask: [1, 0, 1] });
    expect([...out.entries()]).toEqual([[0, 3], [2, 2]]);
    const masked = extractSparseWeights(logits, dims, 0, { mask: [1, 0, 0] });
    expect([...masked.entries()]).toEqual([[0, 3]]);
  });

  it('throws on out-of-range batch index', () => {
    expect(() => extractSparseWeights(logits, dims, 1)).toThrow(/out of range/);
    expect(() => extractSparseWeights(logits, dims, -1)).toThrow(/out of range/);
  });
});

describe('toSparse — position → vocab-id mapping', () => {
  it('maps positions onto input ids, merging duplicates by max weight', () => {
    const byPosition = new Map<number, number>([[0, 3], [1, 2], [2, 5]]);
    const out = toSparse([100, 100, 7], byPosition);
    expect(out.get(100)).toBe(3); // duplicate merged, max kept
    expect(out.get(7)).toBe(5);
    expect(out.size).toBe(2);
  });

  it('drops positions beyond the input id array', () => {
    const byPosition = new Map<number, number>([[0, 3], [5, 9]]);
    const out = toSparse([42], byPosition);
    expect([...out.entries()]).toEqual([[42, 3]]);
  });
});

describe('sparse dot products', () => {
  const a = new Map<number, number>([[1, 2], [2, 3]]);
  const b = new Map<number, number>([[2, 4], [3, 5]]);
  const c = new Map<number, number>([[9, 1]]);

  it('sparseDotProduct sums the intersection', () => {
    expect(sparseDotProduct(a, b)).toBe(12); // 3*4
    expect(sparseDotProduct(a, c)).toBe(0);
    expect(sparseDotProduct(b, a)).toBe(12); // symmetric
  });

  it('sparseDotByToken sums over shared token strings', () => {
    const x = new Map<string, number>([['hello', 2], ['▁world', 3]]);
    const y = new Map<string, number>([['▁world', 4], ['▁zzz', 5]]);
    expect(sparseDotByToken(x, y)).toBe(12);
    expect(sparseDotByToken(x, new Map<string, number>())).toBe(0);
  });
});

describe('getBgeSparseEmbedder — graceful degradation + m3-only gate', () => {
  const throwingFactory = () => {
    throw new Error('unavailable in test');
  };

  afterEach(() => {
    vi.doUnmock('@huggingface/transformers');
    vi.doUnmock('@xenova/transformers');
    vi.resetModules();
  });

  function makeFakeMaskedLM(opts: { failModel?: string } = {}) {
    const tokenizer: any = (text: string) => ({
      input_ids: [7, 11, 9],
      attention_mask: [1, 1, 1],
    });
    tokenizer.from_pretrained = async () => tokenizer;
    tokenizer.convert_ids_to_tokens = (ids: number[]) => ids.map((id) => `tok${id}`);

    const logits = new Float32Array([
      1, -2, 3, 0.5,
      0, 2, -3, 1,
      -1, -5, -2, -4,
    ]);
    const model: any = async () => ({ logits: { data: logits, dims: [1, 3, 4] } });
    model.from_pretrained = async (name: string) => {
      if (opts.failModel && name.includes(opts.failModel)) {
        throw new Error(`simulated load failure: ${name}`);
      }
      return model;
    };

    // loadTransformersClasses requires AutoModel (dense class) — stub it.
    const autoModelStub: any = { from_pretrained: async () => ({}) };
    return { AutoTokenizer: tokenizer, AutoModel: autoModelStub, AutoModelForMaskedLM: model };
  }

  it('returns null for non-sparse models without touching the network (registry gate)', async () => {
    vi.doMock('@huggingface/transformers', throwingFactory);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeSparseEmbedder, getSparseStatus } = await import('../src/memory/bge-sparse.js');
    const emb = await getBgeSparseEmbedder('Xenova/bge-base-en-v1.5');
    expect(emb).toBeNull();
    const status = getSparseStatus('Xenova/bge-base-en-v1.5');
    expect(status.error).toMatch(/no native sparse/);
  });

  it('embeds m3 text into a vocab-id sparse vector', async () => {
    const fake = makeFakeMaskedLM();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeSparseEmbedder } = await import('../src/memory/bge-sparse.js');
    const emb = await getBgeSparseEmbedder('Xenova/bge-m3');
    expect(emb).not.toBeNull();
    const vec = await emb!.embed('sample text');
    // pos0 max=3 → id 7; pos1 max=2 → id 11; pos2 dropped (ReLU).
    expect([...vec.entries()]).toEqual([[7, 3], [11, 2]]);
    expect(emb!.modelName()).toBe('Xenova/bge-m3');
  });

  it('decode() maps vocab ids to token strings', async () => {
    const fake = makeFakeMaskedLM();
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeSparseEmbedder } = await import('../src/memory/bge-sparse.js');
    const emb = await getBgeSparseEmbedder('Xenova/bge-m3');
    const vec = await emb!.embed('sample text');
    const decoded = emb!.decode(vec);
    expect(decoded.get('tok7')).toBe(3);
    expect(decoded.get('tok11')).toBe(2);
  });

  it('reports null + error when a mocked load fails, one-shot per model', async () => {
    const fake = makeFakeMaskedLM({ failModel: 'bge-m3' });
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeSparseEmbedder, getSparseStatus } = await import('../src/memory/bge-sparse.js');
    const first = await getBgeSparseEmbedder('Xenova/bge-m3');
    expect(first).toBeNull();
    const status = getSparseStatus();
    expect(status.attempted).toBe(true);
    expect(status.loaded).toBe(false);
    expect(status.error).toBeTruthy();

    const tStart = Date.now();
    const again = await getBgeSparseEmbedder('Xenova/bge-m3');
    expect(again).toBeNull();
    expect(Date.now() - tStart).toBeLessThan(50);
  });

  it('returns null when AutoModelForMaskedLM is missing from the loaded package', async () => {
    const fake = makeFakeMaskedLM();
    delete (fake as any).AutoModelForMaskedLM;
    vi.doMock('@huggingface/transformers', () => fake);
    vi.doMock('@xenova/transformers', throwingFactory);

    const { getBgeSparseEmbedder, getSparseStatus } = await import('../src/memory/bge-sparse.js');
    const emb = await getBgeSparseEmbedder('Xenova/bge-m3');
    expect(emb).toBeNull();
    expect(getSparseStatus().error).toMatch(/AutoModelForMaskedLM unavailable/);
  });
});
