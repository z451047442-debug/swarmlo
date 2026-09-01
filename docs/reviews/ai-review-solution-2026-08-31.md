# 全仓 AI 审查解决方案（2026-08-31）

> 分支：`ai-review-fix-2026-08-31`。完整发现清单见同目录 `ai-review-findings-2026-08-31.md`。

## 一、项目真实业务逻辑（审查结论）

**Swarmlo 仓库是"AI 编排 CLI 框架 + 两个面向用户的产品"的三层 monorepo：**

1. **框架层**（`v3/@claude-flow/` 26 个包 + 根 `plugins/` 22 个插件）：核心产品是 `swarmlo-cli`（26 命令 CLI + 60+ MCP 工具），围绕它展开的治理面（guidance 策略门禁/审计账本）、记忆面（memory 包 AgentDB+HNSW 双后端、neural 包 SONA/MoE/EWC 学习）、协作面（swarm 集群协调、codex 双模式、federation 跨实例联邦）、安全面（security 包注入/路径/凭据校验、browser 包 ADR-122 封签轨迹）。数据流：CLI/MCP 调用 → `callMCPTool` 单一授权点 → 工具 handler → sql.js/AgentDB 读写。发布链为 fork 三包 `swarmlo-cli`/`swarmlo`/`swarmlo-app`（版本锁步 3.39.1，由 `scripts/audit-umbrella-version-lockstep.mjs` 强制）。
2. **ruvocal**（`swarmlo/src/ruvocal/`）：HuggingChat 风格对话应用（SvelteKit）。数据层实际是 **RVF 单文件 JSON**（`db/ruvocal.rvf.json`，实现 Mongo 兼容接口），非 Mongo——记忆中的"Mongo 兜底"未落地，`postgres.ts`/镜像内 mongod 均为死代码。流程：OIDC 登录 → 会话树 → OpenAI 兼容流生成 → JSONL 推回 → RVF 持久化；MCP 工具循环（autopilot）优先于直连生成。
3. **goal_ui**（`v3/goal_ui/`）：GOAP 目标规划研究 UI + Agent 开发仪表盘双页产品。**无数据库是有意设计**（Supabase schema 全空）；持久化仅三处 localStorage。数据流：自然语言目标 → A* GOAP 规划 → edge function 逐 step 拉 AI 研究数据 → 可导出报告（md/docx/xlsx/pdf）。

**审查正面结论**：三包版本锁步无漂移；正式发布链路的完整性校验是硬门禁；未发现硬编码密钥泄露；vault/helper-signing/proxy-verify/policy-runtime 等安全模块实现严谨；goal_ui i18n 四组字典键集完全一致。

## 二、解决方案总纲

修复按 **5 波实施**，按"宁缺毋假"仓库纪律处理假功能（决策 D3）。

### 第 0 波：决策记录（用户已确认，2026-08-31）

| 决策 | 确认结果 | 实施含义 |
|------|----------|----------|
| D1 ruvocal 数据层 | **加固 RVF** | 原子写（tmp+rename）+ WAL 备份 + 启动失败保留损坏文件并告警 + 文档明确要求有状态部署/持久卷；不接线 Mongo |
| D2 goal_ui edge function 鉴权 | **仅文档标注** | 不改鉴权代码，在 supabase/README 文档标注"匿名可调用、部署前需自行加鉴权/限流"风险 |
| D3 假功能处理 | **全部真接线** | 每个假功能优先接真实实现（复用现有 daemon/worker/日志/状态设施）；确无真实设施可接时返回诚实错误并移除假成功输出，绝不允许假成功 |

### 第 1 波：P0+P1 直接可修（无决策依赖，~30 项）

**ruvocal（6 项）**：GridFS 三链路 API 对齐（uploadFile/downloadFile/share 改 RVF `end()`/`toArray`/async 拷贝语义）；MCP health 端点加 requireAuth + 收紧 localhost 白名单 + connect-time IP 校验；OIDC token 按签发方限定转发；TRUSTED_EMAIL_HEADER 绑定可信代理并剥离入站头；RVF 原子写（tmp+rename）+WAL 备份+启动失败保留损坏文件告警；失效锁改内存/带时间戳；Dockerfile 去 COPY .env 改 ARG/Secret。

**框架层（~24 项）**：
- 命令注入/SQL 注入 5 处：deployment release-manager/validator（semver 白名单+execFileSync）、ruvector-bridge 2 处（参数化）、credential-generator（转义）。
- ESM 误用 require 3 处：mcp/http.ts、guidance/wasm-kernel.ts、hooks/index.ts addHook → import。
- 静默安装 2 处：update/index.ts、embeddings auto → opt-in；mcp-tools/auto-install 加 pin+逃生阀。
- 内存/数据正确性：flash-attention 缓冲区按 numK 分配；learning-bridge 两处签名修正；llm-hooks 缓存 key 改 SHA-256；funnel/state.ts 与 proxy/install.ts tmp 唯一化；memory-initializer 384 维硬编码改动态维度。
- 安全加固：guidance restrict() 提权原语、conformance-kit 默认 key 拒绝、federation signEnvelope 桩/verifyEnvelope 恒真、PII 伪哈希改真 sha256、iot tlsInsecure 默认 false、handshake 用 remoteNode.publicKey。
- 诚实化：cleanup --force 加属主校验、start --daemon 真后台化或报未实现、plugins WorkerPool 桩标注。

**工程面**：package-rvf.sh 修正路径；threat-model.mjs severity 门统一实现；flywheel handler try/catch+路径校验；插件脚本 npx @latest 统一 pin；neural-trader 示例改 --ignore-scripts+pin。

### 第 2 波：P2 直接可修（~90 项，按区域并行）

- **ruvocal**：migrations 注册、matches() 深比较、sortDocs Date 归一化、aggregate 缺失 stage、models 启动降级、__debug 端点鉴权、messageEvents TTL、files 死字段、嵌套 workflows 迁移、config/auth 信号锁。
- **goal_ui**：开发阶段 developmentPhases 索引、devPhase 按钮接线、僵尸 import 删除、Math.random 闪烁、死配置 UI、example.env 补齐、widget hex 色、Share 按钮、拖拽文案。
- **mcp+guidance**：unsubscribe 真退订、会话按连接映射、WS 认证实现、sampling/connection-pool 定时器清理、ErrorCodes 互异、retriever 全量哈希、ledger 判重、truth-anchors 验签、analyzer 临时目录注入、authority 密钥持久化。
- **cli 核心/命令层**：cve 退出码、ANSI 剥离、state.json 统一结构、config reset、init 映射、process/mcp/audit 假功能诚实化（D3）、150x 宣称清理（跨包约 20 处）、mock 工具名修正、start.ts YAML 数组、file:// URL。
- **swarm/security/browser**：domainPool 释放、broadcast 重试展开、reload 先验后毁、parseDependencies 复用、createCache 逻辑、eval 黑名单补充、路径校验、脱敏统一、execFileSync 异步化、sessions LRU。
- **memory/neural 等**：binaryQuantize Uint32Array、testRvf 真实探测、keyIndex 回灌、缓存 invalidate、hybrid-repository 文档诚实化、rvf 排序/计数、WASM 本地打包、GAE 公式、EWC 空转移除宣称、edge scale 独立、a2c 先算后清、persistent-cache SHA-256、claims active 统计、console.log 注入式、token-optimizer 启发式标注、migration 真实读取、moe-router 形状校验、Buffer byteOffset、applyNormalization 接线。
- **工程面**：CI 假绿三件套（integration-tests/verification-pipeline/ci.yml）、v3-ci 发布脚本名、rollback 非 fast-forward、.env.example 补齐、CODEOWNERS、SKILL.md、mcp-bridge Dockerfile pin、overrides 有界区间。
- **plugins/**：Windows /dev/null、exit(-Infinity)、roomId 分隔符、trust_remote_code 白名单、eq 方向、handler try/catch、120s 透传、parseTrailingJson、argv→文件。

### 第 3 波：P3 择要修复（机械类全修，设计取舍类不改并说明理由）

- **全修**：文档/宣称一致性（README/STATUS/SECURITY/verification/CHANGELOG 补录 3.39.x、旧插件名、过期行号注释）、死文件删除（各包 tmp.json、App.css）、ErrorCodes/样式类一行修复、常量时间比较、revokeObjectURL 等。
- **不改并说明理由**：goal_ui tsconfig strict:false 收紧（涉及大改，列为后续任务）；terminal-tools 明文落盘（设计行为，标注即可）；SWARMLO_STATE_DIR 覆盖（设计取舍）；smoke.sh grep 锚点机制（契约有效）。

### 第 4 波：验证与运行检查

- goal_ui：`npm run build` + `npm run lint`；ruvocal：`npm run check` + `npm run build`；v3：`pnpm typecheck` + `vitest`；根：`npm test` 相关脚本。
- 按步骤 6-8 的要求做全量验证与运行检查。

## 三、实施组织（步骤 3）

- 按上述区域划分 **8 个并行写代理**，每个代理拥有**互不重叠的文件所有权**（无两个写者碰同一文件），全部基于当前分支 `ai-review-fix-2026-08-31` 直接改（只读代理共享 checkout，写代理按不相交文件集分工，由主会话做集成验收）。
- 共享文件（根 package.json、CHANGELOG.md、v3/package.json 等）仅由主会话修改。
- 每个代理改完后跑区域内类型检查/测试；全部完成后主会话统一跑全量验证。

## 四、验收标准

1. 全部 P0/P1 修复且有验证证据（测试/构建通过）。
2. P2 修复率 ≥ 90%；未修复项有书面理由。
3. 假功能全部诚实化（不再有假成功输出、假 PID、伪造审计）。
4. 全部"未验证性能宣称"从用户可见输出中清除或替换为实测值。
5. goal_ui 与 ruvocal 构建通过；框架层 vitest/typecheck 通过。

## 五、实施结果与验证（2026-09-01 更新）

> 修复由 10 个并行代理完成（会话中断后由主会话核查补缺），4 个只读核查代理逐项对照本方案验证。

### 验证矩阵

| 验证 | 结果 |
|------|------|
| v3 全部 23 包 `tsc --noEmit`（逐包、真实退出码） | ✅ 全部 EXIT=0 |
| cli 包启动冒烟（`npm run build` + `node bin/cli.js --version`） | ✅ `swarmlo v3.39.1` |
| cli p1-commands 测试（vitest） | ✅ 42 passed / 14 skipped（skip 均有 live-MCP-context 理由注释） |
| goal_ui `npm run build`（widget + app） | ✅ 通过 |
| goal_ui `npm run lint` | ⚠️ 46 error 全部为既有 `no-explicit-any` 债务（diff 归因确认零引入） |
| ruvocal `npm run build` | ✅ 通过（adapter-node，1m28s） |
| ruvocal `npm run check` | ⚠️ 157 → 79 error；修复后剩余全部为既有 RVF 层债务（ctx null ×43、ObjectId ×19、Partial 泛型 ~17） |

### 修复完成度（4 个核查代理逐项打分）

| 区域 | 结果 |
|------|------|
| ruvocal 17 项 | 16 完整 + 1 部分（config 侧信号锁，见遗留清单）≈ 94% |
| goal_ui + 工程面 21 项 | 18 完整 + 2 部分 + 1 未修（flywheel P1）→ 主会话补齐后 21/21 |
| cli 核心/命令层 17 项 | 13 完整 + 4 部分（autoUpdate opt-in 未接主入口、宣称残留、mock skip、YAML/file://）→ 主会话补齐 3 项，skip 保留（有理由） |
| 框架各包 | P0/P1 10/10；P2 抽查 40/41（retriever provider 接线仅 warn，符合 D3 诚实化） |

### 主会话补缺（22 文件 + 3 删除）

- **P0 静默更新**：`cli/src/index.ts` 启动路径改显式 opt-in（`CLAUDE_FLOW_AUTO_UPDATE=true`/`SWARMLO_AUTO_UPDATE=1` 才执行，默认仅检查+通知）；`commands/update.ts` 帮助文案同步。
- **P1 flywheel**：`mcp-tools/metaharness-tools.ts` run/promote 加 `validatePath`（穿越/元字符）+ readFileSync try/catch，异常返回结构化错误。
- **ruvocal 类型**：`config.ts` `ExtraConfigKeys` 补 49 个未入 env 模板的键 + `get()` 签名放宽；`stores/settings.ts`、`utils/messageUpdates.ts` 补 `autopilotMaxSteps`。
- **宣称清理**：13 处 150x/12,500x/2.49x-7.47x → 实测口径（"measured ~1.9x-4.7x vs brute force" / "benchmark pending"）：help、swarm banner、init wizard、hooks MCP note、init 生成模板 ×5、plugins README、swarmlo-core SKILL、neural-trader bench/perf-notes。
- **Windows file://**：`commands/init.ts` 2 处改 `pathToFileURL(...).href`。
- **YAML 数组**：`commands/start.ts` `parseSimpleYaml` 支持 `- item` 列表。
- **pin 残留**：5 处 `@latest` → 版本 pin（swarmlo-adr ×2、metaharness ×2、neural-trader 文档 ×1）。
- **CI 假绿收尾**：根 `package.json` `build:ts` 去掉 `|| true`。
- **死文件**：删除 3 个零引用孤儿组件（ExecutionDashboard/ExecutionMonitor/CodePreview）。

### 遗留事项（需后续决策）

1. **ruvocal `.github/workflows/` 9 个文件已删除**（方案允许的"迁移或删除"路线之一），但仓库根无等价 CI 承接——ruvocal 现无 lint/test/deploy 自动化。需确认是否有意。
2. ruvocal check 剩余 79 个既有类型错误：根因是 RVF Mongo 兼容层泛型摩擦 + 严格空检查（`ctx` null），建议列独立 issue。
3. goal_ui lint 46 个既有 `no-explicit-any`；`AdvancedSettingsModal` 4 tab 仅 qualityGates 有消费点。
4. ruvocal `config.ts` `updateSemaphore` 仍走 semaphores 集合轮询（RVF 单进程下 isConfigStale 判定可工作，非真锁语义）。
5. `guidance/wasm-kernel.ts` `getKernel()`/`isWasmAvailable()` 同步→异步为破坏性 API 变更（仓内无同步调用方，tsc 已过；外部消费者需注意）。
6. `retriever.ts` 真实 provider 接线仅 console.warn（D3 诚实化路线，无真实设施可接）。
7. cli `p1-commands.test.ts` 14 个 skip 保留（依赖 live MCP context，有注释理由）。
8. `memory/agentdb-backend.ts` `rebuildIndexes` 与 `migration.ts` `readSqliteRows` 依赖运行期内部 API，需集成测试确认（本次未跑全量 vitest）。
