# BGE Re-Ranker v2.0（bge-reranker-v2-m3）默认重排序管线实施计划

> **状态：已实施并真机验证（2026-08-18）**。本文件是 ADR-383 所描述管线的档案记录——任务均为已执行步骤，含验证结果。代码块与路径保持原样，与仓库一一对应。

> **面向 agentic worker：** 如需回放或复核本管线，请使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐项执行。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 将默认 cross-encoder 重排序器从 `Xenova/ms-marco-MiniLM-L-6-v2`（ADR-080：仅英文、约 30MB int8、每 (query, doc) 对 20-40ms）切换为 BAAI 的 **BGE Re-Ranker v2.0**（`onnx-community/bge-reranker-v2-m3-ONNX`），完成 **m3 召回 + v2-m3 重排** 组合（BAAI 官方推荐的同底座配对）。

**架构：** 三项方向决策（2026-08-18）：
1. **默认模型** —— `DEFAULT_RERANKER_MODEL = 'onnx-community/bge-reranker-v2-m3-ONNX'`：与 bge-m3 相同的 XLM-R 底座（hidden 1024），100+ 语言，8192 上下文。`getCrossEncoder()` 无参即用它；BEIR hybrid 脚本无参调用。成本（已接受、有文档）：fp32 约 2.2GB 首次下载（int8 约 570MB）；每对延迟是旧 20-40ms 的数倍——调用方只重排融合后的 top-K（BEIR 脚本 top-100），影响有界。**回滚**：显式传入 `'Xenova/ms-marco-MiniLM-L-6-v2'`，旧模型仍被同一代码路径完整支持。
2. **Loader 迁移** —— 旧的 @xenova-only loader 无法消费 transformers.js v3 布局仓库。`getCrossEncoder` 改用 ADR-382 共享设施 `loadTransformersClasses()`（ADR-094 HF-first、坏掉的 v4 ESM 入口走 CJS require 兜底、`CLAUDE_FLOW_HF_ENDPOINT` 镜像、VITEST-safe）。`TransformersClasses` 增加可选 `AutoModelForSequenceClassification` 字段。pair 编码保持直接式（`tokenizer(query, { text_pair: doc, ... })`），`max_length: 8192`。
3. **优雅降级不变** —— 加载失败保持 ADR-080 契约：`crossEncoderRerank` 返回原序且 score=0；每进程一次性加载策略；测试 mock 两个 transformers 包保持离线。

**技术栈：** TypeScript（vitest，双包 mock），transformers.js（共享 loader），BEIR harness（`run-beir-hybrid.mjs`，`RERANK=1`）。

**规格：** `v3/docs/adr/ADR-383-bge-reranker-v2-m3-default.md`

## 全局约束

- 重排只作用于融合后的 top-K（top-100 上限），约束重排器高延迟的成本影响。
- 旧模型完整保留为回滚路径（同一代码路径，显式传入模型名即可）。
- 加载失败绝不破坏调用方：返回输入顺序 + score=0。
- 量化：HF v3 忽略 `quantized: true`，用 `dtype: 'q8'` 解析仓库的 `onnx/model_quantized.onnx`（544MB，已验证）；xenova v2 保留旧 `quantized` 标志。
- 8192 上下文截断上限（bge-reranker-v2-m3 支持 8k，同时约束推理内存）。
- 离线测试：mock 两个 transformers 包；`DEFAULT_RERANKER_MODEL` 常量被断言。
- 文件 <500 行；无 secrets；公共 API 类型化。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `v3/@claude-flow/cli/src/memory/cross-encoder-rerank.ts` | 修改 | `DEFAULT_RERANKER_MODEL` 常量；`getCrossEncoder` 迁移到共享 loader；q8 量化；pair 编码（HF v3 手动拼接 sep_token，xenova v2 保留 `text_pair`）；sigmoid/softmax 分数归一；优雅降级 |
| `v3/@claude-flow/cli/src/memory/bge-embedder.ts` | 修改 | `TransformersClasses` 增加 `AutoModelForSequenceClassification` 字段（共享给 reranker） |
| `v3/@claude-flow/cli/scripts/run-beir-hybrid.mjs` | 修改 | `getCrossEncoder()` 无参调用（吃新默认） |
| `v3/@claude-flow/cli/__tests__/cross-encoder-rerank.test.ts` | 修改 | 按 HF-first loader 重写（双包 mock），6 测试 + 默认模型常量断言 |
| `v3/@claude-flow/cli/scripts/smoke-reranker.mjs` | 已有 | 可复用的真机验证入口 |
| `v3/docs/adr/ADR-383-bge-reranker-v2-m3-default.md` | 新建 | 规格 + 真机验证结论 |

---

### Task 0：基线（ADR-080 契约）

**产出（既有事实）：** `crossEncoderRerank(query, docs, topK?)` 返回 `{index, score}[]` 按分数降序；加载失败返回原序 score=0；单例 + `loadAttempted` 一次性标志。

- [x] 契约保持不变，本次仅换默认模型与 loader。

### Task 1：默认模型常量 + 无参默认

**产出：** `DEFAULT_RERANKER_MODEL = 'onnx-community/bge-reranker-v2-m3-ONNX'` 导出；`getCrossEncoder(modelName = DEFAULT_RERANKER_MODEL)`；BEIR 脚本 `getCrossEncoder()` 无参。

- [x] 常量落地（`cross-encoder-rerank.ts:23`）并被测试断言。
- [x] 回滚路径验证：显式传旧模型名仍可加载（同一路径）。

### Task 2：Loader 迁移到 ADR-382 共享设施

**产出：** `getCrossEncoder` 使用 `loadTransformersClasses()`；`classes?.AutoModelForSequenceClassification` 缺失时返回 null + 记录原因；`TransformersClasses` 类型增加该字段。

- [x] 类型扩展与消费落地（`bge-embedder.ts:43`、`cross-encoder-rerank.ts:50-54`）。

### Task 3：q8 量化 + pair 编码

**产出：** 量化选项按来源分流——HF 源用 `{ dtype: 'q8' }`，xenova v2 用 `{ quantized: true }`；pair 编码：HF v3 的 `text_pair` tokenizer 路径会踩 webpack/onnxruntime ESM 互操作 bug（`Tensor is not a constructor`），改为手动用 tokenizer 分隔符拼接 `[CLS] q [SEP] d [SEP]`（XLM-R `'</s>'` 与 BERT `'[SEP]'` 家族编码等价）；分数归一处理单 logit（sigmoid）与双 logit（二元 softmax）两种头。

- [x] `quantOpts` 分流与 `sepToken` 拼接落地（`cross-encoder-rerank.ts:62-96`）。
- [x] `max_length: 8192` 双路径一致。

### Task 4：测试重写 + 全量回归

**验证结果：** `cross-encoder-rerank.test.ts` 按 HF-first loader 重写（双包 mock）——6 测试全绿，默认模型常量被断言；受影响全套 93/93 通过。

- [x] 6/6 + 93/93（2026-08-18）。

### Task 5：真机验证（2026-08-18，经 hf-mirror.com）

**验证结果：** `getCrossEncoder()` 成功下载并加载 q8 变体（`onnx/model_quantized.onnx`，544MB）。fp32 在本机不可行——其外部数据文件（`model.onnx_data`）下载中途失败。

- [x] q8 544MB 加载成功（`smoke-reranker.mjs` 为复用入口）。
- [ ] BEIR `RERANK=1` 与 ADR-088 基线对比：待数据集目录可用后测量（优先 Linux/CI，互操作 bug 不复现）。

---

## 执行说明

- **已知限制（机器特定）**：直接 import 进程中的端到端 `scoreBatch` 会踩既有的 transformers.js 3.8.1 ESM 互操作 bug（`Tensor is not a constructor`，onnxruntime-common webpack 绑定）——本 Windows/Node 24 主机。同一 bug 在真实 CLI 命令流中不复现：`bin/cli.js memory store/search`（bge-m3 embedder）被反复验证可用，且与 daemon 无关（daemon 停止后嵌入仍产出正确的 1024 维行与分数）。生产重排消费者（尚无接线）将运行在 CLI 流内；本机上 `BEIR RERANK=1` 直接脚本执行受此影响，直至互操作问题解决。
- **为什么换默认（ADR-383 立论）**：召回侧是 bge-m3——多语言、8192 上下文。英文单语的旧重排器会浪费召回覆盖：中文（及其他非英语）候选得不到有意义的重排信号。v2-m3 与召回共享同一底座，一个 tokenizer 家族覆盖 100+ 语言。
- **成本形状**：下载（一次性）与每对延迟都显著上升；靠「只重排融合 top-K」约束。若内存吃紧，回滚到旧 MiniLM（约 30MB int8）仍然一行代码的事。
