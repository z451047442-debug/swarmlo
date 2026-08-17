# Ruflo 嵌入模型适配清单 + bge-m3 接入方案

> 调查日期：2026-08-15（原清单）。更新日期：2026-08-16（bge-m3 接入完成，ADR-382）；2026-08-17（**默认模型改为 bge-m3 1024 维**）。
> 范围：代码库内实际引用的嵌入模型（非文档声称值）。代码路径均为仓库根目录相对路径。

## 一、本地 ONNX 模型（主路径）

运行时库按优先级选择（[`v3/@claude-flow/embeddings/src/transformers-loader.ts`](v3/@claude-flow/embeddings/src/transformers-loader.ts)）：

1. `@huggingface/transformers`（ADR-094 优先——修复 protobufjs <7.5.5 RCE 漏洞链）
2. `@xenova/transformers`（旧版回退，兼容未升级的安装）

### 双编码器（bi-encoder，生成向量）

| 模型 | 维度 | 角色 | 代码位置 |
|---|---|---|---|
| **`Xenova/all-MiniLM-L6-v2`** | 384 | **全系统默认**。记忆嵌入、任务路由（量化加载）、HNSW 索引、AgentDB、RAG 检索，全部插件共享 | [`v3/@claude-flow/cli/src/memory/memory-initializer.ts:2248`](v3/@claude-flow/cli/src/memory/memory-initializer.ts:2248)、[`v3/@claude-flow/cli/src/ruvector/task-embedder.ts:62`](v3/@claude-flow/cli/src/ruvector/task-embedder.ts:62) |
| `Xenova/all-mpnet-base-v2` | 768 | `init` 向导可选的高精度模型 | [`v3/@claude-flow/cli/src/commands/init.ts:1117`](v3/@claude-flow/cli/src/commands/init.ts:1117)、`:1623`（choices 白名单） |
| `Xenova/paraphrase-MiniLM-L3-v2` | 384 | `embeddings models` 列表中的轻量备选（17MB） | [`v3/@claude-flow/cli/src/commands/embeddings.ts:1335`](v3/@claude-flow/cli/src/commands/embeddings.ts:1335) |
| `Xenova/bge-small-en-v1.5` | 384 | BEIR 检索评测系列（33M 参数，约 40MB） | [`v3/@claude-flow/cli/src/memory/bge-embedder.ts`](v3/@claude-flow/cli/src/memory/bge-embedder.ts) 头部注释 |
| `Xenova/bge-base-en-v1.5` | 768 | BGE 系列**默认**（110M 参数，约 110MB） | [`v3/@claude-flow/cli/src/memory/bge-embedder.ts:37`](v3/@claude-flow/cli/src/memory/bge-embedder.ts:37) |
| `Xenova/bge-large-en-v1.5` | 1024 | BGE 系列最大档（335M 参数，约 440MB） | 同上注释 |
| **`Xenova/bge-m3`** | 1024 | **2026-08-16 新增**：多语言 + 8192 上下文 + 原生 sparse（详见第七节，ADR-382） | [`v3/@claude-flow/cli/src/memory/embedding-models.ts`](v3/@claude-flow/cli/src/memory/embedding-models.ts) 注册表 |
| **`Xenova/bge-large-zh-v1.5`** | 1024 | **2026-08-16 顺带收录**：中文检索专用，中文查询指令 | 同上注册表 |

### 交叉编码器（cross-encoder，重排序）

| 模型 | 用途 | 代码位置 |
|---|---|---|
| `Xenova/ms-marco-MiniLM-L-6-v2` | 混合检索（bi-encoder + BM25）召回 top-K 之后的精排（ADR-080）。int8 量化约 30MB，单 (query, doc) 对约 20–40ms | [`v3/@claude-flow/cli/src/memory/cross-encoder-rerank.ts:31`](v3/@claude-flow/cli/src/memory/cross-encoder-rerank.ts:31) |

## 二、云端 API 模型

| 模型 | 维度 | 说明 | 代码位置 |
|---|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 | 需 `OPENAI_API_KEY` | [`v3/@claude-flow/cli/src/commands/providers.ts:24`](v3/@claude-flow/cli/src/commands/providers.ts:24)、`:476` |
| OpenAI `text-embedding-3-large` | 3072 | 需 `OPENAI_API_KEY` | 同上 `:477` |

## 三、加载回退链

`loadEmbeddingModel` 的实际加载顺序（[`v3/@claude-flow/cli/src/memory/memory-initializer.ts:2169`](v3/@claude-flow/cli/src/memory/memory-initializer.ts:2169)）：

```
AgentDB v3 bridge（ADR-053，仅默认路径；显式配置模型时跳过——ADR-382）
  → BGE 家族分支（显式配置 bge-* 时；失败则 fail-fast，不落回通用管线——ADR-382）
    → Transformers.js pipeline（Xenova/all-MiniLM-L6-v2，384 维，默认）
      → agentic-flow ReasoningBank（computeEmbedding）
        → ruvector ONNX
          → hash 兜底
```

任一步失败即落到下一步，最终兜底保证不会崩溃。注意：加载失败会被记住（不重试），所以网络问题修复后需重启进程。

## 四、关键约束与注意事项

1. **维度一致性是硬约束**：全链路（记忆、路由、HNSW 索引、RAG、插件）都对齐 384 维。MiniLM 是"事实标准"；换用 mpnet（768 维）或 BGE 系列只在特定子路径生效，混用会导致向量维度不匹配。**2026-08-16 起生产管线支持显式模型钩子 + 双层维度守卫（ADR-382，见第七节），但默认路径行为不变。**
2. **BGE 与 MiniLM 是两条独立代码路径**：BGE 用 `AutoTokenizer + AutoModel` 低级 API（绕开 agentic-flow 的 transformers.js——后者依赖 sharp，在 darwin-arm64 无 libvips 时会失败），CLS-token pooling + L2 归一化，查询侧按注册表加 BAAI 官方指令（en-v1.5 英文前缀，ADR-090 实测 NFCorpus +0.009 nDCG@10；zh-v1.5 中文前缀；**bge-m3 无需指令**）。
3. **任务路由嵌入器**（`task-embedder.ts`）单独量化加载 MiniLM（`quantized: true`），带 LRU 缓存（默认 500 条，约 1.5MB），批处理模式实测 ~1.83× 加速。
4. **`embeddings init`** 写入 `.claude-flow/embeddings.json`（model、dimension、hyperbolic 配置），维度按模型名推断：含 `mpnet` → 768，否则 384。**2026-08-16 起该文件的 `model` 字段被生产管线作为配置回退读取（env 未设时），其 dimension 仅是提示、非权威（ADR-382）。**
5. **插件侧全部对齐 `all-MiniLM-L6-v2`**：`ruflo-agentdb`、`ruflo-rag-memory`、`ruflo-ruvector`（npx ruvector，384 维 HNSW）、`ruflo-neural-trader`（基准脚本显式 `DIM = 384`）。ADR-382 明确不动这些插件。
6. **Hyperbolic / Poincaré 球是几何后处理**（`embeddings hyperbolic` 子命令），不是新模型。
7. **量化**：cross-encoder 与 task-embedder 均 int8 量化；`embeddings models` 列表中的模型默认非量化下载。

## 五、相关 ADR 索引

| ADR | 内容 |
|---|---|
| ADR-053 | AgentDB v3 桥接优先加载嵌入模型 |
| ADR-080 | 交叉编码器重排（ms-marco） |
| ADR-085 | BEIR 评测脚手架 |
| ADR-086 | BGE 双编码器嵌入器 |
| ADR-090 | BGE-en-v1.5 查询前缀（+0.009 nDCG@10） |
| ADR-094 | 优先 `@huggingface/transformers`（protobufjs CVE 修复） |
| **ADR-382** | **bge-m3 dense + sparse 接入 + 生产嵌入模型钩子（2026-08-16）** |

## 六、快速结论

- **日常默认模型（2026-08-17 起）**：`Xenova/bge-m3`（1024 维，ONNX，dense + sparse）。首次使用需联网下载 ~570MB int8 权重；离线时给出明确报错（不再静默退化）。回退到 MiniLM 的逃生门：`CLAUDE_FLOW_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2`。
- 可选：mpnet（768 维）、BGE en 三档（检索评测）、MiniLM-L3（更轻）、`BGE_MODEL=Xenova/bge-m3` 走 BEIR 评测路径。
- **bridge（AgentDB）仅在"未显式配置且解析模型为 MiniLM"时介入本地管线——bge-m3 默认下本地记忆管线完全不经过 bridge（全部 11 个入口统一条件化：load/generate/store/search/HNSW 增查/list/get/delete/purge/控制器激活；仅 walRefusalError 诊断性查询 bridge）；bridge 仍是 4 个 384 维插件的直连后端。**
- **HF 镜像（2026-08-17）**：`CLAUDE_FLOW_HF_ENDPOINT`（回退 `HF_ENDPOINT`）在三处加载器设置 transformers 的 `env.remoteHost`——受限网络可用 hf-mirror.com 等镜像拉取模型，绕过 huggingface.co 拦截。**本机冒烟验证可先试：`CLAUDE_FLOW_HF_ENDPOINT=https://hf-mirror.com claude-flow memory init --force`。**
- 精排：ms-marco 交叉编码器（仅混合检索路径启用）。
- 云端：OpenAI 两个 text-embedding-3 模型（需 API key）。

## 七、bge-m3 接入方案（2026-08-16，ADR-382）

> 决策背景：bge-m3 与 bge-large-zh-v1.5 对比后，m3 全维度领先（1024 维 dense、8192 上下文、100+ 语言、原生 sparse、C-MTEB ≈66.1 vs ≈64.5），按用户确认的范围实施：**dense + sparse 一起接** + **生产管线加模型钩子**。

### 交付内容

| 类型 | 文件 | 说明 |
|---|---|---|
| 新建 | `v3/@claude-flow/cli/src/memory/embedding-models.ts` | 共享模型注册表（6 模型条目；精确 → 短 ID → 子串启发式解析） |
| 新建 | `v3/@claude-flow/cli/src/memory/bge-sparse.ts` | m3 稀疏路径：AutoModelForMaskedLM + BAAI ReLU-max 提取（纯函数）+ 点积 + decode；batch=1（250k 词表 logits 内存约束） |
| 新建 | `v3/@claude-flow/cli/src/memory/embedding-guard.ts` | 双层维度守卫 + 配置解析（env > embeddings.json > 默认） |
| 重构 | `v3/@claude-flow/cli/src/memory/bge-embedder.ts` | HF-first 加载（ADR-094 模式）+ spec 驱动（maxLen/前缀/dim + 首次 embed 真实回填）+ 按模型隔离加载失败 + safeProp（vitest mock 兼容） |
| 编辑 | `v3/@claude-flow/cli/src/memory/hybrid-retrieval.ts` | 新增 `fuseDenseSparse`（min-max 归一加权和，默认 1:0.3） |
| 编辑 | `v3/@claude-flow/cli/src/memory/memory-initializer.ts` | `loadEmbeddingModel({modelName?, dimension?})` + model:dim 缓存键 + BGE 分支 + 层 1 守卫 + `getInitialMetadata` 元数据键 + `storeEntry` 层 2 守卫 + `generateEmbedding` 显式配置时跳过 bridge |
| 编辑 | `v3/@claude-flow/cli/scripts/run-beir-hybrid.mjs` | `BGE_SPARSE=1` 第三 RRF 系统（权重 0.3）+ `{model}.sparse.json` 缓存（token 字符串） |
| 编辑 | `v3/@claude-flow/cli/scripts/run-beir-lucene-bm25.mjs` | `BGE_MODEL` env 覆盖（与其余 3 个 BEIR 脚本对齐） |
| 编辑 | `v3/@claude-flow/cli/package.json` | `@huggingface/transformers ^3.0.0` optionalDependency |
| 新建 | `v3/docs/adr/ADR-382-bge-m3-dense-sparse-and-model-hook.md` | 6 项决策 + 护栏 + 待实测数据位 |
| 测试 | `__tests__/embedding-models / bge-embedder / bge-sparse / memory-initializer-hook.test.ts` + `hybrid-retrieval.test.ts` 扩展 | 83 个新测试，全离线（mock provider + 合成张量） |

### 使用方式（2026-08-17 真机验证版）

> 当前代码在本地仓库（npm 尚未发布）：用本地入口 `node bin/cli.js`，**不要**用 `npx @claude-flow/cli@latest`（那是 npm 上的旧版）。
> PowerShell 用户注意：环境变量要用 `$env:VAR = "值"` 语法（bash 的 `VAR=x 命令` 在 PowerShell 无效）。

**首次使用（新机器，需下载模型一次）**：

```powershell
cd D:\PycharmProjects\ruflo\v3\@claude-flow\cli
$env:CLAUDE_FLOW_HF_ENDPOINT = "https://hf-mirror.com"   # 网络受限时走镜像；能直连 huggingface.co 可省略
node bin/cli.js memory init --force                        # 建库（1024 维）；模型 fp32 ~2.2GB 仅下载一次
```

**日常使用（模型已缓存，无需镜像 env）**：

```powershell
node bin/cli.js memory store --key 键名 --value "内容"      # 写入（自动生成 1024 维向量）
node bin/cli.js memory search --query "查询"                # 语义搜索（m3 默认阈值 0.15）
node bin/cli.js memory search --query "查询" --threshold 0.3 # 显式阈值永远优先
```

实测参考：相同文本余弦 1.00；相关句（"中文测试" vs "这是一条中文语义检索测试记忆"）0.17——m3 的 dense 空间比 MiniLM 松，0.15 默认阈值经实测校准（注册表 `defaultThreshold`）。

**切换模型 / 逃生门**：

```powershell
$env:CLAUDE_FLOW_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2"  # 回退 MiniLM 384（离线/降级场景）
$env:CLAUDE_FLOW_EMBEDDING_MODEL = "Xenova/bge-m3"            # 显式指定（当前默认即是）
$env:CLAUDE_FLOW_EMBEDDING_DIMENSION = "1024"                 # 显式维度断言（可选，不匹配会报错）
```

旧 384 库升级：`memory init --force` 重建（旧向量不迁移；双层守卫会拦截维度混用并给出重建指引）。

**BEIR 评测（可选，需数据集目录，bash 语法）**：

```bash
BGE_MODEL=Xenova/bge-m3 node scripts/run-beir-bge.mjs                    # m3 dense
BGE_SPARSE=1 BGE_MODEL=Xenova/bge-m3 node scripts/run-beir-hybrid.mjs    # + m3 sparse 第三 RRF 系统
```

### 旧向量不兼容 → 双层守卫（绝不静默混用）

1. **层 1（加载时）**：`dimension` option/env 与各分支实际维度比对，不匹配 → `success:false` + 可操作错误。
2. **层 2（写入时）**：`storeEntry` 读取 `vector_indexes.dimensions`，与嵌入维度不一致 → 拒绝写入，错误信息含重建命令 `claude-flow memory init --force`。
3. 旧库缺元数据 → 视为 unknown 放行（不强制迁移）。

### 护栏（不在范围）

- 5 个 384 维插件（ruflo-agentdb / rag-memory / ruvector / neural-trader）不动——钩子默认 MiniLM，插件契约不变。
- `task-embedder.ts` 与 neural-router 保持 MiniLM（后续跟进）。
- sparse 生产记忆库存储 v1 不做（文件缓存先行）；ColBERT 不做；`claude-flow.config.json` 不加嵌入模型字段。

### 验证状态

- ✅ `pnpm -r build` exit 0；dist 冒烟：注册表 m3→1024 维、`loadTransformersClasses` 实机解析 `@huggingface/transformers`。
- ✅ 新测试 85/85 全绿（2026-08-17 默认翻转后）；全量回归 3162 通过，110 个失败均为既有环境问题（Windows EPERM symlink / WASM 集成 / 网络依赖），与本次改动零关联。
- ✅ **真模型冒烟已完成（2026-08-17，经 hf-mirror.com 镜像）**：bge-m3 fp32（2.2GB）真实加载执行；store 写入 1024 维、相同文本搜索余弦 1.00、相关查询命中。关键经验：① HF 必须锁 `^3.8.1`（4.x ESM 入口加载即崩、CJS 入口执行报 Tensor.location）；② 模型缓存位于 pnpm store 包目录 `.cache/Xenova/bge-m3/`；③ **m3 dense 空间比 MiniLM 松**（相关句实测 0.17–0.22）→ 默认阈值按模型定制（m3=0.15，命令层移除硬编码 0.7），显式 `--threshold` 优先。
- ⏳ BEIR dense/sparse 实测对比（ADR-088 基线）仍待数据集目录就绪后执行。
- ⚠️ 待验证风险：Xenova/bge-m3 仓库是否携带 **MaskedLM ONNX 变体**（sparse 路径依赖）。若无，sparse 优雅降级为 null（`getSparseStatus().error` 给出原因），dense 不受影响。
