#!/usr/bin/env node
// smoke-reranker.mjs — real-model smoke for the default cross-encoder
// reranker (ADR-383: onnx-community/bge-reranker-v2-m3-ONNX, q8).
//
// Usage:
//   CLAUDE_FLOW_HF_ENDPOINT=https://hf-mirror.com node scripts/smoke-reranker.mjs
//
// Scores a related Chinese (query, doc) pair and an unrelated one; the
// related pair should score clearly higher. First run downloads the
// quantized model (~544MB) via transformers.js.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { getCrossEncoder, getCrossEncoderStatus, DEFAULT_RERANKER_MODEL } = await import(
  pathToFileURL(join(CLI_ROOT, 'dist/src/memory/cross-encoder-rerank.js')).href
);

console.log(`Reranker model: ${DEFAULT_RERANKER_MODEL}`);
const t0 = Date.now();
const ce = await getCrossEncoder();
if (!ce) {
  console.error('LOAD FAIL:', JSON.stringify(getCrossEncoderStatus(), null, 2));
  process.exit(1);
}
console.log(`Loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const scores = await ce.scoreBatch('中文测试', [
  '这是一条中文语义检索测试记忆',
  '今天天气很好，适合出门散步',
]);
console.log('related  :', scores[0].toFixed(4));
console.log('unrelated:', scores[1].toFixed(4));
const ok = scores[0] > scores[1];
console.log(ok ? 'SMOKE OK — related pair scores higher' : 'SMOKE FAILED — ordering unexpected');
process.exit(ok ? 0 : 1);
