// Cross-encoder reranker — graceful-degradation tests (ADR-080, ADR-383).
//
// We don't run the actual cross-encoder here (network + multi-GB model
// download would make the test suite flaky). Instead we verify the fallback
// contract: when the model can't be loaded the API must still return a
// well-shaped answer (input order preserved, score=0) so callers never break.
//
// Since the loader is now HF-first (ADR-382), both transformers packages
// are mocked to throw — otherwise the real @huggingface/transformers would
// resolve and trigger a real model fetch.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const throwingFactory = () => {
  throw new Error('unavailable in test');
};

function mockUnavailable() {
  vi.doMock('@huggingface/transformers', throwingFactory);
  vi.doMock('@xenova/transformers', throwingFactory);
}

beforeEach(() => {
  vi.resetModules();
  mockUnavailable();
});

afterEach(() => {
  vi.doUnmock('@huggingface/transformers');
  vi.doUnmock('@xenova/transformers');
  vi.resetModules();
});

describe('crossEncoderRerank — graceful degradation contract', () => {
  it('returns input order with score=0 when model name is invalid', async () => {
    const { getCrossEncoder, crossEncoderRerank } = await import('../src/memory/cross-encoder-rerank.js');
    // Force the loader to fail by passing a guaranteed-bad model name.
    const ce = await getCrossEncoder('does-not-exist/no-such-model-anywhere');
    expect(ce).toBeNull();

    // Even though the model failed, rerank() must still return a usable
    // ranking — caller falls back to hybrid order.
    const out = await crossEncoderRerank('query', ['doc1', 'doc2', 'doc3']);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(out.every((r) => r.score === 0)).toBe(true);
  });

  it('respects topK when degraded', async () => {
    const { getCrossEncoder, crossEncoderRerank } = await import('../src/memory/cross-encoder-rerank.js');
    // Trigger a failure first
    await getCrossEncoder('does-not-exist/no-such-model-anywhere');
    const out = await crossEncoderRerank('query', ['a', 'b', 'c', 'd', 'e'], 2);
    expect(out).toHaveLength(2);
  });

  it('handles empty doc list', async () => {
    const { crossEncoderRerank } = await import('../src/memory/cross-encoder-rerank.js');
    const out = await crossEncoderRerank('query', []);
    expect(out).toEqual([]);
  });

  it('getCrossEncoderStatus reports loaded=false after failed load', async () => {
    const { getCrossEncoder, getCrossEncoderStatus } = await import('../src/memory/cross-encoder-rerank.js');
    await getCrossEncoder('does-not-exist/no-such-model-anywhere');
    const status = getCrossEncoderStatus();
    expect(status.attempted).toBe(true);
    expect(status.loaded).toBe(false);
    expect(status.error).toBeTruthy();
  });

  it('does not retry after a failure (one-shot load policy)', async () => {
    const { getCrossEncoder } = await import('../src/memory/cross-encoder-rerank.js');
    const first = await getCrossEncoder('does-not-exist/no-such-model-anywhere');
    expect(first).toBeNull();
    // Subsequent call should NOT re-attempt — returns null immediately.
    const tStart = Date.now();
    const second = await getCrossEncoder('any-other-name');
    const elapsed = Date.now() - tStart;
    expect(second).toBeNull();
    expect(elapsed).toBeLessThan(50); // No retry; instant return.
  });

  it('default reranker model is bge-reranker-v2-m3 (ADR-383)', async () => {
    const { DEFAULT_RERANKER_MODEL } = await import('../src/memory/cross-encoder-rerank.js');
    expect(DEFAULT_RERANKER_MODEL).toBe('onnx-community/bge-reranker-v2-m3-ONNX');
  });
});
