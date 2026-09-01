# 全仓 AI 审查发现清单（2026-08-31）

> 分支：`ai-review-fix-2026-08-31`。10 个只读分析代理覆盖全部 5553 个被跟踪文件。
> 级别定义：P0=阻断上线/安全事故；P1=高风险 bug；P2=中等；P3=低/风格。
> 格式：`[级别] 文件:行 — 问题 — 建议修法`。标注"待验证"的需要先确认再修。

## 1. ruvocal 产品（swarmlo/src/ruvocal/）

- `[P0]` `cloudbuild.yaml:34-59` + `src/lib/server/database.ts:44-64` — 数据层实为 RVF 单文件 JSON（非 Mongo），Cloud Run `--allow-unauthenticated` 多实例+易失磁盘 → 冷启动全量丢数据、多实例数据分裂；镜像内 mongod 无人连接是死配置 — 见解决方案决策 D1
- `[P0]` `src/lib/server/files/uploadFile.ts:22-27` — 对 RVF GridFS 返回对象调用 `upload.once("finish")`（无事件机制）→ 带文件消息必 500 — 改用 RVF `end()` 语义
- `[P0]` `src/lib/server/files/downloadFile.ts:11-31` — `bucket.find(...).next()`、`fileStream.on("data")` 在 RVF 上不存在 → 含文件会话发消息/导出必崩 — 对齐 `toArray`/await
- `[P0]` `src/lib/server/conversation.ts:63-71` + `routes/conversation/[id]/share/+server.ts:55-59` — `openDownloadStream(...).pipe()`、`.on("error")` 不存在 → 分享导入/分享含文件会话必 500 — 改为 async 拷贝路径
- `[P1]` `routes/api/mcp/health/+server.ts:27-51` + `lib/server/urlSafety.ts:41-53` — 未认证端点接受任意 URL 发起服务端连接，放行 localhost/内网 → 未认证 SSRF/内网探测 — health 加 requireAuth；MCP 客户端加 connect-time IP 校验
- `[P1]` `lib/server/endpoints/openai/endpointOai.ts:233` 等 5 处 — OIDC access token 无条件 `Bearer` 转发给 OPENAI_BASE_URL/转写/路由端点，非 HF 签发方时=企业令牌泄漏 — 按签发方限定转发，否则用服务端 key
- `[P1]` `lib/server/auth.ts:407-430` + `hooks/handle.ts:62-115` — TRUSTED_EMAIL_HEADER 一旦设置即无条件信任请求头 → 任意邮箱冒充、会话接管 — 绑定可信代理并剥离入站同名头
- `[P1]` `lib/server/database/rvf.ts:150-206` — 500ms 防抖+整文件非原子写；崩溃 → 损坏 → 启动仅 log 后"全新开始" → 静默全量丢数据 — 原子写（tmp+rename）+WAL 备份+启动失败保留损坏文件并告警
- `[P1]` `lib/migrations/lock.ts:8-25` — 锁依赖 Mongo 唯一索引（RVF 为 no-op）→ 永远成功；过期锁无 TTL → 实例崩溃后其他实例永久自旋 — 内存/带时间戳锁
- `[P1]` `Dockerfile:32` + `.dockerignore:9-10` — `COPY .env` 且放行 .env：CI 构建必失败；本地构建把密钥烘焙进镜像 — 改 ARG/Secret，禁止 COPY .env
- `[P2]` `lib/migrations/routines/index.ts:15` — migrations 空数组，8 个 routine 从不被 import → 迁移系统整体死代码 — 显式注册
- `[P2]` `lib/server/database/rvf.ts:326-330` — `matches()` 用 String() 比较 → 任意对象恒等 → `$pull` 可清空整个数组 — 深比较或仅支持原语并告警
- `[P2]` `lib/server/database/rvf.ts:466-472` — sortDocs 对 null 返回 dir 与 Mongo 相反；Date/ISO 字符串混存时比较失效 — 统一 Date 归一化
- `[P2]` `routes/admin/export/+server.ts:47-78` + `lib/jobs/refresh-conversation-stats.ts:60-257` — aggregate 用 $lookup/$facet 等 RVF 不支持的 stage → parquet 导出必抛错、统计不计算 — 实现缺失 stage 或 JS 层聚合
- `[P2]` `lib/server/models.ts:494,508-511` — 顶层 await rebuildModels，OPENAI_BASE_URL 不可达 → 模块加载抛错 → 整个应用不可用；空数组取 `_models[0].id` TypeError — 启动降级+延迟重试
- `[P2]` `routes/__debug/openai/+server.ts:5-21` — 未认证 debug 端点回显 OPENAI_BASE_URL 探测结果 — 删除或加 requireAdmin
- `[P2]` `lib/server/database/rvf.ts:1015-1078` — GridFS base64 内嵌单文件：10MB 文件→13MB 文本整文件重写；messageEvents 无 TTL 全表扫 — 文件外置+定期清理
- `[P2]` `routes/conversation/[id]/+server.ts:161-172` — JSON `files` 字段解析后从未使用（实际走 formData），双路径漂移 — 删除死字段
- `[P2]` `.github/workflows/*` — 位于嵌套目录，GitHub Actions 不识别 → lint/test/deploy 全部静默不运行 — 迁到仓库根或删除
- `[P2]` `lib/server/config.ts:85-98` + `auth.ts:117-177` — CONFIG_UPDATE/OAUTH_TOKEN_REFRESH 依赖同款失效锁 — 随锁一并修复
- `[P3]` `routes/healthcheck/+server.ts` — 不验证存储可写/模型已加载，DB 损坏仍报 OK — 加写入探针
- `[P3]` `lib/server/adminToken.ts:22` — 非恒定时间比较 — crypto.timingSafeEqual
- `[P3]` `Dockerfile` + `entrypoint.sh:12-15` — INCLUDE_DB=true 启动无人连接的 mongod — 移除
- `[P3]` `routes/admin/export/+server.ts:61-68` — forEach(async) 未等待 — for...of + await
- `[P3]` `lib/server/database/rvf.ts:507,956` — 返回浅拷贝，调用方改嵌套对象丢失更新 — 深拷贝/冻结
- `[P3]` `routes/api/mcp/servers/+server.ts` — 配置端点无认证（信息量低）— 至少登录后可见
- `[P3]` `scripts/updateLocalEnv.ts:43-45` — 生成 .env.local 强改 COOKIE_SECURE=false — 标注仅本地开发用并校验环境

## 2. goal_ui 产品（v3/goal_ui/）

- `[P1]` `supabase/config.toml:4` — `verify_jwt=false` 且 5 个函数 CORS `*`、无速率限制 → 任何人可刷爆 AI_API_KEY 配额 — 见解决方案决策 D2
- `[P1]` `src/pages/Agents.tsx:1339-1422` — 开发阶段 execution/current 页签错误引用 `researchPhases`；1368 行把 objective 翻译后塞进 cost 值 → 界面错位文本 — 改 developmentPhases 索引
- `[P2]` `src/pages/Agents.tsx:1343-1351,264-289` — 开发阶段 Resume/Skip/Retry 驱动的是研究阶段 currentPhase，对 devPhase 零影响 — 改操作 devPhase
- `[P2]` `src/pages/Agents.tsx:34,37,46` — ExecutionDashboard/ExecutionMonitor/CodePreview 僵尸 import（eslint no-unused-vars 被关闭）— 删除或接入
- `[P2]` `src/pages/Agents.tsx:1458` — `Math.random()*10` 每次渲染随机 → 数值闪烁 — 确定性 mock
- `[P2]` `src/components/agents/AdvancedSettingsModal.tsx:121-135` — 保存 localStorage 后无代码读取，死配置 UI — 接入或移除
- `[P2]` `README.md:76` + `docs/DEPLOYMENT.md:49` — 引用不存在的 example.env — 补上（.gitignore 只忽略 *.local）
- `[P2]` `src/widget.tsx:54-58` + `tailwind.config.ts:23` — hex 色注入 `hsl(var(--primary))` 无效 CSS → 第三方嵌入时 primary 类失效 — hex 直接注入或改 hsl 格式
- `[P2]` `src/components/ResearchReportModal.tsx:511-518` — Share 按钮无 onClick — 接逻辑或移除
- `[P2]` `i18n/dictionaries/*/agents.ts:422` — 文案宣称拖拽但 TaskBoard 无拖拽实现 — 改文案或实现
- `[P3]` `netlify.toml:35` + `public/_headers:19` — X-Frame-Options: ALLOWALL 无效值 — 删除
- `[P3]` `AgentStep.tsx:122` — border-3 非 Tailwind 默认类 — border-2
- `[P3]` `RealTimeEventLog.tsx:44-52` — createObjectURL 不 revoke — 导出后 revoke
- `[P3]` `Demo.tsx:229` — 链接 /WIDGET-INTEGRATION.md 404 — 修链或去掉
- `[P3]` `Index.tsx:1407` 等 — 置信度 94% 硬编码 — 用真实数据
- `[P3]` `widget.tsx:51-59` — defaultGoal 读取后未使用 — 传入 GoalInput 或删除
- `[P3]` `AgentStep.tsx:75-95` 等 3 组件 — setTimeout 链无 cleanup — effect cleanup
- `[P3]` `App.css` — Vite 模板遗留死文件 — 删除
- `[P3]` `tsconfig.app.json:18-22` — strict:false + 大量 as any — 逐步收紧（列为后续，本次不强制）
- `[P3]` `Agents.tsx:1072-1076` — QualityGates 硬编码与 dev 阶段 85/92 不一致 — 共用 qualityMetrics
- `[P3]` `Index.tsx:158,1255,1140` — 模块级缓存不随语言失效；session 恢复后 visibleSteps>1 无继续入口；--card-bg 无消费点
- `[P3]` `supabase/functions/research-api/` — 前端从未调用，与 research-step 重叠 — 标注 deprecated 或删除

## 3. CLI 核心库（v3/@claude-flow/cli/src，除 commands/）

- `[P1]` `funnel/state.ts:38-40` — 固定 `${target}.tmp` 临时名，并发写互相覆盖、更新静默丢失 — writeFileAtomic 唯一化 tmp
- `[P1]` `memory/memory-initializer.ts:1804-1806` — repairVectorIndexes 硬编码 384 维，与 bge-m3(1024) 冲突 → memory_store 报 dimension mismatch — resolveConfiguredEmbedding().dimensions
- `[P1]` `update/index.ts:84-101` + `update/executor.ts:131-140` — 每次启动默认静默 `npm install <pkg>@latest --save-exact` 改写用户 package.json — 改 opt-in/隔离目录
- `[P2]` `transfer/store/download.ts:326-333` — pattern.name 未清洗拼路径可 `../` 穿越；验签失败仅警告 — 白名单+拒绝 `..`+默认拒绝
- `[P2]` `memory/rabitq-index.ts:95,124` — 硬编码 `.swarm` 路径+明文读加密库 — getMemoryRoot()+加密读取
- `[P2]` `appliance/rvfa-runner.ts:38-58` — spawnAsync 无 timeout、stdout 无界累积 — 加 timeout+maxBuffer
- `[P2]` `mcp-tools/auto-install.ts:60-118` — MCP 工具调用自动 npm install 无 pin — 固定版本+SWARMLO_NO_AUTOINSTALL 逃生阀
- `[P3]` `mcp-server.ts:280-292` — 非交互进程 status 谎报 running；`520-529` 10MB 错误帧缺 id；`436-441` uncaught 只记日志不退出
- `[P3]` `memory/memory-bridge.ts:96` — startsWith 前缀判断可被 `/proj-evil` 绕过 — path.relative/realpath
- `[P3]` `memory/intelligence.ts:631-632,1062-1072` — 只读查询带副作用不落盘；recordStep 全量存库污染 — 移出/降置信度
- `[P3]` `memory/memory-initializer.ts:2158-2163` — 衰减公式可为负 — max(0,...) 钳制
- `[P3]` `funnel/events.ts:10-13` — 注释称传输不存在但 event-transport.ts 已实现（flushEvents 未导出，死代码）— 修正注释或接线
- `[P3]` `mcp-tools/http-fetch-tools.ts:91-92` — IPv6 ULA 判断误伤 `fcloud.com` 类主机名 — 仅对含 `:` 字面量判断
- `[P3]` `update/executor.ts:71-76` — update-history 非原子写 — writeFileRestricted
- `[P3]` `proxy/install.ts:170` — 固定 tmp 名并发竞争 — 唯一化
- `[P3]` `src/tmp.json` — 死文件 — 删除
- `[P3]` `mcp-tools/terminal-tools.ts:192` — 明文落盘属设计，建议工具描述显著标注

## 4. CLI 命令层 + 测试（v3/@claude-flow/cli/src/commands/ 等）

- `[P1]` `cleanup.ts:27-33,223-224` — `cleanup --force` 无属主校验直接 rmSync 泛名目录 → 误删用户 `./data` — 校验目录内容确为 swarmlo 产物
- `[P1]` `start.ts:214-243` + `bin/cli.js:327-332` — `start --daemon` 假后台化：进程当场退出留 stale PID — 真 fork+detached 或报"未实现"
- `[P2]` `process.ts` 全家桶 — daemon/workers/signals 是"演出"（写瞬态 PID、假状态、假数据）— 接真实现或标注未实现并拒绝写 PID
- `[P2]` `security.ts:481` — cve 退出码三元恒 0，CI 门禁失效 — `exitCode: rows>0 ? 1 : 0`
- `[P2]` `security.ts:734-804` — audit 用 mtime/文件名伪造审计日志；clear/export 无实现 — 真实审计或降级
- `[P2]` `security.ts:177-179,349` — findings 含 ANSI 转义码写入 JSON，下游解析失配 — 持久化前剥离 ANSI
- `[P2]` `mcp.ts:547-587,717-777,211,262` — toggle 假成功；logs 硬编码假日志；27 工具数硬编码；--daemon 未接线 — 接真实或报未实现
- `[P2]` `swarm.ts:811-822,471,648-662` — stop 无视 swarmId；init/start 写同文件两种结构 → status 显示 no-active-swarm — 统一结构
- `[P2]` `config.ts:304-333` — reset --section 静默忽略 — 实现或删除选项
- `[P2]` `init.ts:1027-1037` — wizard permissionRequest 选择被丢弃 — 补映射
- `[P2]` `memory.ts` — 同族命令 MCP/本地可用性分裂且文档未说明 — 本地回退
- `[P2]` `__tests__/p1-commands.test.ts:29-126` — mock 工具名斜杠 vs 实现下划线，永不命中；大量 it.skip — 修正+减 skip
- `[P2]` 多处 — 输出面宣传已撤回的 150x/2.49x-7.47x/84.8%/32.3% 数字 — 全部替换实测值或删除
- `[P3]` `doctor.ts:1129` — MCP key 建议用旧名自相矛盾 — 统一 claude-flow
- `[P3]` `bin/cli.js:43-47` — --tools 参数解析可误吞下一参数；`bin/mcp-server.js:149-162` 过滤逻辑与 cli.js 不一致
- `[P3]` `completions.ts:20-36` — 静态补全列表严重漂移 — 从 commandLoaders 生成
- `[P3]` `start.ts:36,111` — parseSimpleYaml 不解析数组；`init.ts:82,93` — Windows file:// URL 非法
- `[P3]` `hooks.ts:4356,4627,4754`、`agent.ts:549` — statusline/metrics 伪造指标（DB 字节/2048 等）— 改 null/省略
- `[P3]` 类型选项默认值写成字符串；threats dread/pasta 未实现；agntcy 注释过期；secrets 正则漏报 Bearer 形态；doctor 跑 npx tsc 触发网络

## 5. mcp + guidance 包（v3/@claude-flow/）

- `[P1]` `mcp/src/transport/http.ts:479` — ESM 包内 `require('crypto')` → ReferenceError，HTTP 认证整体不可用 — `import * as crypto`
- `[P1]` `guidance/src/capabilities.ts:167-211` — restrict() 整体 spread 可提权（delegatable/resource 可放宽）— 白名单字段处理
- `[P1]` `guidance/src/conformance-kit.ts:995-1000` — 硬编码默认签名密钥，proof 链可被伪造 — 无 key 即抛错
- `[P2]` `mcp/src/server.ts:745-769` — resources/unsubscribe 未真正退订 → 订阅泄漏 — 按会话保存 subscriptionId
- `[P2]` `mcp/src/server.ts:503,1028-1036` — currentSession 服务器级单例，多客户端串号 — 按连接维护会话映射
- `[P2]` `mcp/src/transport/websocket.ts:284-293` — WS+认证死路（无 authenticate 实现）— 实现或升级时校验
- `[P2]` `mcp/src/sampling.ts:274-281` — Promise.race 超时不清理 → unhandled rejection — 败者挂 catch
- `[P2]` `mcp/src/connection-pool.ts:171-177` — setTimeout 不清理 — clearTimeout
- `[P2]` `mcp/src/types.ts:640-652` — ErrorCodes 重复值 — 分配互异码
- `[P2]` `guidance/src/retriever.ts:109-116` — 缓存 key 取前 200 字符串内容；默认 createRetriever 用 test-only provider — 全量哈希+接真实 provider
- `[P2]` `guidance/src/wasm-kernel.ts:66` — ESM 内 require 被吞 → WASM kernel 永不可用 — await import()
- `[P2]` `guidance/src/ledger.ts:251-292` — 事件二次入账 — finalize 判重
- `[P2]` `guidance/src/truth-anchors.ts:407-419` — importAnchors 不验签 — 强制 verify
- `[P2]` `guidance/src/analyzer.ts:608-656` — 就地备份/替换 CLAUDE.md，恢复失败 unlink 用户文件 — 临时目录注入
- `[P2]` `guidance/src/authority.ts:301-311` — signatureSecret 每次随机 → 重启无法验签 — 显式注入/持久化
- `[P3]` persistence TOCTOU 锁→wx；meta-governance signingKey 死配置；gates fullCommand 泄露；adversarial context 滞留；测试 import 扩展名风格；validateEffect 缺守卫；JSON.stringify 循环引用
- `[P3]` 两包根目录空 `tmp.json` — 删除

## 6. plugins/swarm/security/browser 包（v3/@claude-flow/）

- `[P1]` `plugins/src/integrations/ruvector/ruvector-bridge.ts:595,516,523` — SQL 注入：LIMIT/SET LOCAL 直接拼接 MCP 输入 — 参数化+Number 强校验
- `[P1]` `plugins/src/integrations/ruvector/ruvector-bridge.ts:704-707,539-540` — 向量字面量 SQL 注入 — 校验元素均为 number
- `[P1]` `security/src/credential-generator.ts:319-329` — 密码含 `$()` 时 env 脚本被 source 触发命令注入 — 转义
- `[P1]` `plugins/src/workers/index.ts:201-216` — WorkerInstance.executeTask 桩实现，全部"即时成功" — 真实现或标注未实现
- `[P2]` ruvector whereClause 参数错位；selectColumns/conflictColumns 不转义
- `[P2]` `browser/src/mcp-tools/browser-tools.ts:628-686` — eval 黑名单漏 fetch/sendBeacon/WebSocket/cookie — 补外传原语+默认拒绝含 cookie 读取
- `[P2]` `browser/src/mcp-tools/signed-trajectory-tools.ts` 等 — MCP 工具任意文件读写无路径校验 — 统一 PathValidator
- `[P2]` browser workflow-compiler/reasoningbank-adapter/browser-service — 密码明文进工作流/轨迹/学习 — 统一脱敏
- `[P2]` `plugins/src/hooks/index.ts:548-557` — createCache 逻辑反（满了才缓存）— set 移到容量判断外
- `[P2]` `plugins/src/registry/enhanced-plugin-registry.ts:547-577` — reload 先销毁后校验，状态损坏 — 先验证再 shutdown
- `[P2]` `plugins/src/registry/plugin-registry.ts:329-362` — 基础版依赖解析把版本串当插件名 — 复用 parseDependencies
- `[P2]` `swarm/src/message-bus.ts:491-509` — broadcast 重试消息卡死无人消费 — 按原订阅展开投递
- `[P2]` `swarm/src/unified-coordinator.ts:871-931` — 域池 agent 永不释放，15-agent 很快全忙 — 补 releaseAgentToDomain
- `[P2]` `browser/src/application/session-capsule-service.ts:240` — 重签 key 不匹配 verify 必失败 — 用原 key 重签
- `[P2]` `browser/src/infrastructure/agent-browser-adapter.ts:74-78` — execFileSync 阻塞事件循环 — 异步化
- `[P2]` registry initializeWithTimeout 竞速不清理；WorkerPool.terminate 计数漂移；browser sessions Map 无上限
- `[P3]` input-validator 全局 errorMap；token-generator 模偏差；safeJsonStringify DAG 误判；agentic-flow 死代码+150x；tmp.json；双版本号；safe-executor 误拒；propagator P1 占位；oauth callback 不校验；.d.ts 漂移；safetyScore 阈值不稳；DISTANCE_OPERATORS 不存在运算符；setTopology 名不副实

## 7. codex/testing/providers/deployment/federation/iot 等（v3/@claude-flow/）

- `[P1]` `deployment/src/release-manager.ts:97,121-133` — version/tagPrefix 拼进 shell，黑名单漏 `\n` 和双引号 → 命令注入 — semver 白名单+execFileSync
- `[P1]` `deployment/src/validator.ts:272-300` — lintCommand/testCommand 同类命令注入 — 参数化执行
- `[P1]` `plugin-agent-federation/src/plugin.ts:336-337` — signEnvelope 输出可伪造桩、verifyEnvelope 恒真 — 真实 HMAC 或移除
- `[P1]` `plugin-agent-federation/src/plugin.ts:225` — PII"哈希"实为明文前 4 字符 — 真 sha256+salt
- `[P1]` `plugin-iot-cognitum/src/plugin.ts:43` + `seed-client-factory.ts:63` — tlsInsecure 默认 true（可 MITM）— 默认 false
- `[P1]` `plugin-agent-federation/src/domain/services/handshake-service.ts:107-111` — 用响应者自报公钥验签（密钥替换攻击）— 用 remoteNode.publicKey
- `[P2]` `codex/src/migrations/index.ts:926-955` — migrateFromClaudeCode 桩假成功 — 接线或返回失败
- `[P2]` `codex/src/initializer.ts:387,478` — `which codex` Windows 不存在 — 平台选择 which/where
- `[P2]` providers 三家 pricing 无 `?? 0` 兜底；base-provider 流 key 同毫秒碰撞；provider-manager 缓存 key 缺 tools
- `[P2]` `cli-core/src/index.ts:72-76` — ESM require 死代码；`json-backend.ts:132-134` 读放大
- `[P2]` `codex/src/dual-mode/orchestrator.ts:495-518` — runCommand 无超时可永久阻塞
- `[P2]` federation WS 无连接超时；默认 0.0.0.0+ws://；key-${nodeId} 路径穿越；static peer 空公钥
- `[P2]` iot deployFirmware 桩假成功；fire-and-forget unhandled rejection；witness 空链 verified:true
- `[P2]` `aidefence/src/domain/services/threat-detection-service.ts:353-360` — /g 正则 .test() lastIndex 假阴性
- `[P2]` testing/setup.ts 断言 150x/2.49x；agents-md 模板生成 150x；codex marketplace --ref main 未固定 SHA
- `[P3]` config-toml 恒真条件；migrations 死代码；google key 进 URL query；djb2 碰撞；healthy>=0 恒真；npm view 参数注入；Function import 绕过；dual run 体验

## 8. neural/memory/shared/hooks/integration/embeddings/claims（v3/@claude-flow/）

- `[P1]` `neural/src/flash-attention.ts:158-159,250-264` — expBuffer 按 topK(16) 分配但按 numK 读写 → 越界 → 输出全 NaN — 按 numK 分配
- `[P1]` `memory/src/learning-bridge.ts:151-155,191-193` — recordStep 参数与 neural 签名不符 → 学习链路静默失效 — 按位置传参
- `[P1]` `memory/src/learning-bridge.ts:403-406` — 配置对象当 mode 传入 — 先构造再 setMode
- `[P1]` `hooks/src/llm/llm-hooks.ts:97-106` — 缓存 key 截断 base64 → A 的响应返回给 B — 完整 SHA-256
- `[P1]` `embeddings/src/embedding-service.ts:849-873` — provider=auto 静默 npm install 第三方包 — opt-in
- `[P2]` `memory/src/hnsw-index.ts:1166-1181,572-624` — 32 位位域塞 Float32Array（2^24 上限静默丢失）+ 快照不带量化状态 — Uint32Array+Hamming+快照带状态
- `[P2]` `memory/src/database-provider.ts:171-177` — testRvf 恒 true，'auto' 永远选 rvf — 真实探测排序
- `[P2]` `memory/src/agentdb-adapter.ts:207-210` — 半写入（先写后建索引）— 先校验维度
- `[P2]` `memory/src/agentdb-backend.ts:302-307` 等 — keyIndex 启动不回灌，重启后 get 全 null — 初始化重建
- `[P2]` `memory/src/consolidator.ts` — 维护操作不清缓存 — 同步 invalidate
- `[P2]` `memory/src/infrastructure/repositories/hybrid-memory-repository.ts:61-69` — 名为 Hybrid 实为纯内存 Map，进程退出丢数据 — 接真后端或改文档
- `[P2]` `memory/src/rvf-backend.ts:367-374` — 语义查询按插入序返回；get 计数不落盘 — 按相似度排序+dirty 标记
- `[P2]` `memory/src/rvf-learning-store.ts:257-291` — dirty 检查与写文件无锁 → 写丢失 — 序列化写队列
- `[P2]` `memory/src/sqljs-backend.ts:112-116` — WASM 运行时 CDN 加载，离线必失败 — 本地打包
- `[P2]` `neural/src/modes/research.ts:445-457` — "GAE" 公式 delta=γ·r_{t+1} 不是 GAE — 用 value 网络
- `[P2]` `neural/src/modes/balanced.ts:282-298` 等 — EWC 全链路空转（fisher 从未写入）— 真更新或移除宣称
- `[P2]` `neural/src/modes/edge.ts:248-258` — quantizationScale 共享覆盖 — 每矩阵独立 scale
- `[P2]` `neural/src/algorithms/a2c.ts:201-203` — 清空 buffer 后算统计恒 0 — 先算后清
- `[P2]` `hooks/src/index.ts:266-267` — ESM 内 addHook 用 require → 公开 API 一调用即崩 — import
- `[P2]` `hooks/src/reasoningbank/index.ts:962-994,737-755` — npx 子进程阻塞+缓存 key 前 200 字符；storeInAgentDB 传无 id 对象 → 更新落空无限累积
- `[P2]` `embeddings/src/persistent-cache.ts:174-182` — 32 位 FNV 碰撞率 1%+ → 污染检索 — SHA-256
- `[P2]` `claims/src/application/claim-service.ts:186-188` — countByClaimant 含历史 → 误判超限 — 只统计 active
- `[P2]` `memory/src/agentdb-backend.ts:212-225` — 初始化全局替换 console.log — 注入式 logger
- `[P2]` `integration/src/token-optimizer.ts:141-153` — 无关量做差累计"实测节省" — 移除或标注启发式
- `[P2]` `memory/src/migration.ts:178-200` — sqlite 当文本解析，迁移不可用 — 接真实读取
- `[P2]` hooks guidance-provider/statusline 注入 150x 假数字；moe-router 无形状校验；Buffer 取整个 ArrayBuffer（4 处）；applyNormalization 无调用点
- `[P3]` 20+ 项：残留宣称、缓存 key 碰撞、死代码、假指标、裸 JSON.parse、FileLock TOCTOU、statusline ps aux Windows 恒失败等

## 9. 根目录工程面（scripts/CI/docker/文档）

- `[P1]` `swarmlo/src/scripts/package-rvf.sh:51-74` — 引用三个不存在路径（rvf.manifest.json/README.md/.env.example 不在 src/）→ set -e 必失败 — 修正路径基准
- `[P2]` `.github/workflows/integration-tests.yml:176-534` — Math.random 伪造结果+吞异常 → 永不红 — 删除或真测试
- `[P2]` `.github/workflows/verification-pipeline.yml:219-240` — 调用不存在的脚本被 `|| echo` 吞掉；node 18 违反 engines — 接真实脚本或移除
- `[P2]` `.github/workflows/ci.yml:43-44,131-132` — typecheck 死步骤；build:ts 带 `|| true` 不可能失败 — 去 || true
- `[P2]` `.github/workflows/v3-ci.yml:2216` — publish 步骤脚本名不存在（publish:alpha vs publish:v3alpha）→ 发布必失败 — 改名或删 job
- `[P2]` `.github/workflows/rollback-manager.yml:336-391` — 非紧急模式 push 非 fast-forward 必拒 — 改 revert 或显式 force
- `[P2]` `swarmlo/.env.example` 缺失 — 三处文档指引 `cp .env.example .env` 必失败 — 补文件
- `[P2]` `.github/CODEOWNERS:12-38` — 全部指向上游账号 ruvnet — 改 fork 属主
- `[P2]` `v3/swarm.config.ts:257`、`v3/index.ts:29-33` — 150x/2.49x 宣称 — 删除或标"未复现"
- `[P2]` `SKILL.md:8` — 三包名与实际（swarmlo-cli/swarmlo/swarmlo-app）矛盾 — 改写
- `[P2]` `swarmlo/src/mcp-bridge/Dockerfile:12-16` — npm install 无 pin；与 ruvocal/mcp-bridge 双实现漂移 — 钉版本或删旧桥
- `[P2]` `package.json:101-148` — overrides 大量 `>=X` 无上界 — 改有界区间
- `[P3]` package.json main 指向不存在的 dist；SECURITY.md 版本表停 3.5.x；verification/results.md 引用不存在文件；STATUS.md 三处数字互斥+死链；CAPABILITIES.md 旧插件名；README 计数互斥（100+/98/60+ agents、35/39 plugins）；swarmlo/README 徽章指向上游；.gitignore 注释过期；install.sh 版本矛盾；v3 workspaces 死条目；dependabot gomod 错配；adr-166 grep lookahead 不兼容；plugin.json 上游链接；tarball 打包整个 ruvocal fork；CHANGELOG 3.39.0/3.39.1 无条目

## 10. plugins/ 目录 22 插件

- `[P1]` `swarmlo-metaharness/scripts/threat-model.mjs:9` — SEVERITY_RANK 缺 critical → `--fail-on high` 对 CRITICAL 不告警（安全门静默失效）— 从 _harness.mjs 导入统一实现
- `[P1]` `v3/@claude-flow/cli/src/mcp-tools/metaharness-tools.ts:688,752` — flywheel run/promote readFileSync 任意文件读+handler 抛异常 — try/catch+路径校验
- `[P1]` 多个插件脚本（oia-audit/audit-list/audit-trend/similarity/drift-from-history/cost-tracker 6+ 脚本）— `npx swarmlo-cli@latest` 无 pin、无 -y — 统一 ensureCachedInstall 或 pin 版本
- `[P1]` `swarmlo-neural-trader/commands/trader.md` — 示例裸 `npx neural-trader`（该包有 install-hook fork-bomb 前科）— 改 --ignore-scripts + pin
- `[P2]` `metaharness/scripts/test-graceful-degradation.mjs:133` — `/dev/null` Windows 不存在必红 — os.tmpdir()
- `[P2]` `cost-tracker/scripts/health.mjs:132` — 全 skip 时 Math.max([])=-Infinity → 非整型退出码 — 空数组 exit 0
- `[P2]` `business-pods/scripts/pod-tick.mjs:368-370` — roomId 允许 `/` 可路径穿越 — 排除分隔符
- `[P2]` `bge-vl/python/bge_vl_embed.py:225` — trust_remote_code=True 任意代码执行 — 白名单模型
- `[P2]` `graph-intelligence/src/mcp-tools/index.ts:248-268` — eq 约束方向错误永不收敛误报 infeasible — 按 bound-lhs 取方向
- `[P2]` graph-intelligence handler 无 try/catch（4 处）— 包 try/catch 返回 success:false
- `[P2]` `metaharness-tools.ts:151` — MCP 层硬编码 120s 截断 evolve（真实需分钟级）— 透传 timeoutMs
- `[P2]` `drift-from-history.mjs:117` — JSON.parse 无 try — 复用 parseTrailingJson
- `[P2]` `oia-audit.mjs:100-105` — payload 作 argv 传，Windows 32K 上限静默失败 — 临时文件/stdin
- `[P3]` 9 项：MCP 工具名不一致；gaia 引用不存在文件；witness SKILL 误导安装步骤；README 架构图漂移；agent 计数过期；注释过期；PreCompact 计数漂移；smoke.sh 锚点脆弱（作为契约机制有效）；伪造图哈希；namespace 参数矛盾；casa 明文日志；SER 自证度量

## 统计

| 区域 | P0 | P1 | P2 | P3 |
|------|----|----|----|----|
| ruvocal | 4 | 6 | 8 | 8 |
| goal_ui | 0 | 2 | 7 | 11 |
| cli 核心 | 0 | 3 | 3 | 12 |
| cli 命令层 | 0 | 2 | 10 | 10 |
| mcp+guidance | 0 | 2 | 8 | 13 |
| plugins/swarm/security/browser | 0 | 4 | 15 | 15 |
| codex 等 10 小包 | 0 | 6 | 14 | 10 |
| neural/memory 等 7 包 | 0 | 5 | 22 | 20+ |
| 根工程面 | 0 | 1 | 11 | 16 |
| plugins/ 目录 | 0 | 5 | 8 | 9 |
| **合计** | **4** | **36** | **106** | **130+** |
