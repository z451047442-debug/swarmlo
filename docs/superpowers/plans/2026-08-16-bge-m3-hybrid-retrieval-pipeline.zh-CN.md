# BGE-M3 混合检索管线实施计划

> **状态：已实施并真机验证（2026-08-17）**。本文件是 ADR-382 所描述管线的档案记录——任务均为已执行步骤，含验证结果。代码块与路径保持原样，与仓库一一对应。

> **面向 agentic worker：** 如需回放或复核本管线，请使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐项执行。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 将 BAAI 的 BGE-M3 全面接入 swarmlo 的嵌入栈——**dense + sparse 双路检索**（1024 维 dense、8192 token 上下文、100+ 语言、原生 MLM-head 稀疏检索），并新增**生产模型 hook**，使记忆管线不再被硬编码到 MiniLM；默认模型从 MiniLM-384 切换为 bge-m3-1024（2026-08-17 用户决策）。

**架构：** 三项用户拍板的方向决策（2026-08-16，修订 2026-08-17）：
1. **共享注册表** —— 纯 `EmbeddingModelSpec` 配置表 `src/memory/embedding-models.ts` 作为单一事实来源，被 BGE embedder、稀疏路径、生产 hook 三个消费者共用。解析顺序：精确 modelId → 短 ID 别名（embeddings.json 风格）→ 子串启发式（保留旧版维度猜测行为）。
2. **双路检索** —— dense（CLS pooling + L2 归一化，spec 驱动）+ sparse（MLM-head 词法权重，BAAI FlagEmbedding 语义，**仅 m3**），融合用 BAAI 发布的 dense:sparse = 1:0.3 配方；BEIR harness 侧以 RRF 第三系统融合（scale-invariant）。
3. **生产 hook + 双层维度守卫** —— `loadEmbeddingModel({ modelName?, dimension? })` 优先级：选项 > `CLAUDE_FLOW_EMBEDDING_MODEL`/`CLAUDE_FLOW_EMBEDDING_DIMENSION` 环境变量 > `.claude-flow/embeddings.json` > 默认。1024 维与 384 维空间绝不静默混用——加载时与写入时各一道守卫。

**技术栈：** TypeScript（vitest，全离线 mock），transformers.js（`@huggingface/transformers` ^3.8.1 HF-first，`@xenova/transformers` 回退，`createRequire` CJS 兜底），BEIR harness（`run-beir-hybrid.mjs`，Node ESM）。

**规格：** `v3/docs/adr/ADR-382-bge-m3-dense-sparse-and-model-hook.md`

## 全局约束

- **维度隔离**：1024 维（bge-m3）与 384 维（MiniLM 桥接）绝不混存。双层守卫：加载时（`finishBranch` 校验 dimension 选项/环境变量）、写入时（`storeEntry` 经 `assertDimensionCompatible` 检查 `vector_indexes.dimensions`）。错误文案指名两个空间并给出重建命令 `claude-flow memory init --force`。
- **稀疏仅 m3**：注册表 `sparse: true` 门禁；其他模型 `getBgeSparseEmbedder` 返回 null。batch=1 为设计约束——单篇 512 token 文档在 250k 词表上产生约 512MB 的 fp32 logits。
- **生产默认**：默认模型 = `Xenova/bge-m3`（2026-08-17 修订）。首次嵌入下载约 570MB int8 权重；离线安装得到响亮的加载失败而非静默 hash 回退。逃生舱：`CLAUDE_FLOW_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2`。
- **桥接规则（2026-08-17 修订）**：AgentDB 桥接仅在「未显式配置且解析出的模型是桥接自己的 MiniLM」时运行；bge-m3 默认下本地记忆管线完全绕过桥接。覆盖所有本地记忆入口（store/search/HNSW/list/get/delete/purge + 控制器激活）。
- **HF 镜像**：`CLAUDE_FLOW_HF_ENDPOINT`（回退 `HF_ENDPOINT`）在一切 `from_pretrained()` 前设置 `env.remoteHost`；三个 loader（BGE 类、sparse MaskedLM、memory-initializer）全部生效。
- **加载状态按模型名隔离**：一个模型的失败加载不再污染其他模型（旧版单例 + 全局一次性标志已废除）。
- **离线测试**：所有 vitest mock 两个 transformers 包，CI 不下载模型。
- 文件 <500 行；无 secrets；公共 API 类型化；边界输入校验。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `v3/@claude-flow/cli/src/memory/embedding-models.ts` | 新建 | 共享注册表：`EmbeddingModelSpec`、`resolveEmbeddingModel`、bge-m3 / bge-vl / en·zh trio / MiniLM 条目、`BGE_QUERY_PREFIX`（含中文前缀） |
| `v3/@claude-flow/cli/src/memory/bge-embedder.ts` | 修改 | spec 驱动的 bi-encoder：`loadTransformersClasses`（HF-first + CJS 兜底）、per-model 状态、真实隐藏维回填、`applyHfEndpoint` |
| `v3/@claude-flow/cli/src/memory/bge-sparse.ts` | 新建 | m3 原生稀疏：`extractSparseWeights`（纯函数）、`toSparse`、`sparseDotProduct`/`sparseDotByToken`、`AutoModelForMaskedLM` 加载 |
| `v3/@claude-flow/cli/src/memory/hybrid-retrieval.ts` | 修改 | 新增 `fuseDenseSparse`（min-max 归一化 + 1:0.3 加权和；BM25/MMR 原样保留） |
| `v3/@claude-flow/cli/src/memory/memory-initializer.ts` | 修改 | 生产 hook `loadEmbeddingModel({modelName?, dimension?})`、`model:dim` 缓存键、BGE 失败即响亮报错、双层维度守卫、`getInitialMetadata` 播种 |
| `v3/@claude-flow/cli/scripts/run-beir-hybrid.mjs` | 修改 | opt-in `BGE_SPARSE=1` RRF 第三系统（稀疏权重 0.3，`SPARSE_RRF_WEIGHT` 可覆盖），`{model}.sparse.json` 文档缓存（token 字符串，跨 tokenizer 版本可移植）；BM25 默认不动 |
| `v3/@claude-flow/cli/__tests__/embedding-models.test.ts`、`bge-embedder.test.ts`、`bge-sparse.test.ts`、`hybrid-retrieval.test.ts`、`memory-initializer-hook.test.ts` | 新建/修改 | 全离线单测（mock providers、合成张量） |
| `v3/docs/adr/ADR-382-bge-m3-dense-sparse-and-model-hook.md` | 新建 | 规格 + 真机 smoke 结论 |

---

### Task 0：共享注册表 `embedding-models.ts`

**产出：** `resolveEmbeddingModel(modelName)`（精确 → 短 ID → 子串启发式）；bge-m3 条目：`dim: 1024`、`maxSeqLength: 8192`、`pooling: 'cls'`、`queryPrefix: null`（m3 无指令，BAAI 说明加前缀反而有害）、`sparse: true`、`sparseWeight: 0.3`、`denseWeight: 1.0`、`defaultThreshold: 0.15`；bge-large-zh-v1.5 中文查询前缀随表免费获得；`BGE_QUERY_PREFIX` 移入注册表并由 `bge-embedder.ts` 字节级一致地再导出。

- [x] `EMBEDDING_MODELS` 表 + `SHORT_IDS` 别名 + `resolveEmbeddingModel` 启发式回退（已落地，见 `embedding-models.ts:79-181`）

### Task 1：`bge-embedder.ts` spec 化改造

**产出：** `loadTransformersClasses()`（ADR-094 模式：HF-first、xenova 回退、`safeProp` 读取——vitest mock 对未定义导出会抛错，真实模块不会，loader 必须两者都活）；`dim()` 立即返回 `spec.dim` 并在首次 embed 输出后回填真实隐藏维（旧注释自此成真）；截断/查询前缀/pooling 全部来自 spec；加载状态按模型名隔离。

- [x] `buildEmbedder` CLS pooling + L2 归一化、`actualDim` 回填（`bge-embedder.ts:237-249`）
- [x] 加载失败按模型名记忆，不重试（`modelStates` Map）

### Task 2：`bge-sparse.ts` m3 原生稀疏

**产出：** `extractSparseWeights(logits, dims, batchIndex, opts)` 纯函数（`w_t = ReLU(max_vocab(logits[t]))`，支持 attention mask、floor、maxTokens）——用合成张量单测；`toSparse` 位置 → 词表 id（重复按 max 合并）；`sparseDotProduct`（id 键）/`sparseDotByToken`（字符串键，缓存友好）；wrapper 经 `AutoModelForMaskedLM`（`quantized: true`）加载，batch=1 为设计约束；状态/重置镜像 cross-encoder 契约。

- [x] 四个导出函数落地并单测（`bge-sparse.ts:51-120`）
- [x] `sparse: false` 模型返回 null（注册表门禁）

### Task 3：融合——RRF 第三系统 + 纯加权和

**产出：** `fuseDenseSparse(dense, sparse, denseWeight=1, sparseWeight=0.3)`：两侧 min-max 归一化后加权和（BAAI 1:0.3 配方，score 空间）；`run-beir-hybrid.mjs` 增加 opt-in `BGE_SPARSE=1` 第三 RRF 系统（稀疏 RRF 权重 0.3，可覆盖），`{model}.sparse.json` 文档缓存。harness 融合用 RRF 而非 score 空间混合，因为 RRF 尺度不变且已按数据集调参；BM25 默认路径（ADR-088 基线）不动。

- [x] `fuseDenseSparse` 落地并单测（`hybrid-retrieval.ts:154-166`）
- [x] BEIR 脚本 RRF 第三系统 + sparse 缓存（opt-in，默认关闭）

### Task 4：生产 hook `loadEmbeddingModel({ modelName?, dimension? })`

**产出：** 优先级选项 > 环境变量 > `.claude-flow/embeddings.json` > 默认（**默认即 `Xenova/bge-m3`**，2026-08-17 修订）；缓存键变为 `model:dim`；BGE 家族路由到 `getBgeEmbedder` 并包装为 `(text) => ({ data })`（裸 Float32Array 会因 `Array.isArray` 检查失败而静默降级到 hash）；配置的 BGE 模型加载失败则**响亮报错**；桥接仅在「未显式配置 + 解析模型是桥接 MiniLM」时运行；`CLAUDE_FLOW_HF_ENDPOINT` 镜像支持覆盖全部三个 loader。

- [x] `DEFAULT_EMBEDDING_MODEL = 'Xenova/bge-m3'`（`embedding-models.ts:16`）
- [x] `BRIDGE_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'` + 桥接旁路规则
- [x] `applyHfEndpoint`（`bge-embedder.ts:66-76`）

### Task 5：旧向量不兼容——双层守卫，绝不静默

**产出：** 层 1（加载时）：`dimension` 选项/环境变量经共享 `finishBranch` 对照各分支实际维度，不匹配返回 `success: false` + 可操作的错误；层 2（写入时）：`storeEntry` 读取命名空间的 `vector_indexes.dimensions` 并在 INSERT 前 `assertDimensionCompatible`。遗留库缺行 =「未知」→ 放行，不强制迁移。`getInitialMetadata` 播种 `embedding_model`/`embedding_dimensions` 元数据与维度匹配的 `vector_indexes` 行，全新 bge-m3 安装自洽。

- [x] 双层守卫 + 元数据播种落地（`memory-initializer-hook.test.ts` 覆盖）

### Task 6：真机 smoke（2026-08-17 完成）+ 阈值校准

**验证结果（经 hf-mirror.com，真实模型）：** bge-m3 fp32（2.2GB）下载并在 CLI 记忆路径执行——store 写入 1024 维行，相同文本检索 cosine 1.00，相关查询命中 0.17–0.22。

- [x] `defaultThreshold: 0.15` 写入注册表；`searchEntries` 与 `memory search` 派生模型感知默认值；命令选项硬编码的 `default: 0.7` 已移除；显式 `--threshold` 永远优先。
- [ ] BEIR dense/sparse 与 ADR-088 基线对比：待数据集目录可用后测量。

### Task 7：全量验证与提交

- [x] 单测：`embedding-models` / `bge-embedder` / `bge-sparse` / `hybrid-retrieval` / `memory-initializer-hook` 五套全绿（全离线）。
- [x] 真机 smoke 结论已记录进 ADR-382（含 transformers.js 版本陷阱与量化发现）。

---

## 执行说明

- **transformers.js 版本陷阱（实测）**：`@huggingface/transformers` 4.x ESM 入口在本机无法加载（`Named export 'Tensor' not found`——onnxruntime-common CJS 互操作）；其 CJS 入口与 3.8.1 的 CJS 入口均在执行时报 `Tensor.location must be a string`（onnxruntime-node 1.24.3 与 1.27.0 皆然）。可用路径是 **3.8.1 的 ESM 入口跑在 CLI 进程里**。Pin：`^3.8.1`。loader 保持动态 import 优先（vitest mock 兼容），并以原生 `createRequire` 兜底 CJS 入口（`VITEST=1` 下禁用）。
- **`{ quantized: true }` 被 v3 布局仓库忽略** → 实际加载 fp32（2.2GB）；模型缓存位于 pnpm-store 包目录（`.cache/Xenova/bge-m3/`）。`dtype: 'q8'`（约 570MB）为后续项。
- **阈值校准（实测）**：bge-m3 的 dense 余弦分布比 MiniLM 宽松——相关对实测 0.17–0.22，远低于旧版 0.7 CLI 默认。修复：注册表 `defaultThreshold: 0.15`。
- 五个 384 维插件（ruflo-agentdb 等）不受影响——它们直连 AgentDB；本地记忆管线默认改为 bge-m3（1024），这正是默认绕过桥接的原因。
- `task-embedder.ts` 与神经路由保持 MiniLM（独立路径，后续跟进）；稀疏在生产记忆库的持久化与 ColBERT 均不在范围。
