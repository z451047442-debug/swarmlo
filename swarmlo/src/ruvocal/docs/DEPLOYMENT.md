# RuVocal（flo.ruv.io）部署指南

> 本文面向自托管与生产部署，覆盖 Windows 与 Linux 两条路径。
> 托管演示：[flo.ruv.io](https://flo.ruv.io/) —— 无需账号、无需 API key 的多模型 AI 聊天 + MCP 工具调用。
> 源码：`swarmlo/src/ruvocal/`。技术栈：SvelteKit 2 + Svelte 5 · MongoDB（无外部库时自动降级为内嵌 MongoMemoryServer）· OpenAI 兼容模型层（OpenRouter / Hugging Face / Ollama / vLLM…）· WASM-MCP 工具画廊。

## 0. 部署路径一览

| 路径 | 适用场景 | 数据持久化 | 小节 |
|------|---------|-----------|------|
| 本地 dev | 开发调试 | ✅（`./db` 本地目录） | §2 |
| 纯本地生产（无 Docker） | 常开主机 / NAS / 纯本机使用 | ✅（`./db` 本地目录） | §3 |
| Docker 自托管 | 单机 / VPS / NAS | ✅（数据卷） | §4 |
| Google Cloud Run | 生产（托管演示 flo.ruv.io 即此路径） | ⚠ 默认易失，需外接 Atlas | §5 |

架构要点：应用是 Node 服务（SvelteKit adapter-node，端口 **3000**），数据存 MongoDB（`MONGODB_URL` 未设置时用 MongoMemoryServer 持久化到 `./db`）。模型调用全部走 OpenAI 兼容接口（`OPENAI_BASE_URL`），MCP 工具通过 `MCP_SERVERS` 配置的外部 MCP 端点提供。

---

## 1. 前置条件

### 1.1 通用要求

| 依赖 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | **20+（推荐 24**，Dockerfile 即基于 node:24） | 本地开发 / 构建 |
| npm | 9+ | 依赖安装 |
| Git | 任意近期版本 | 克隆仓库 |
| Docker + BuildKit | 24+（**Docker 自托管 / Cloud Build 必需**） | 容器构建（Dockerfile 用了 `COPY --link` 等 BuildKit 语法） |
| gcloud CLI | 460+（**仅 Cloud Run 部署需要**） | 构建提交、服务配置 |

> 只跑本地（§2 / §3）的话，Node.js 就够，Docker 与 gcloud 都不需要；连一个 OpenAI 兼容的模型端点（哪怕本地 Ollama）即可完整体验聊天功能。

### 1.2 Windows 安装

```powershell
# Node.js（含 npm）
winget install OpenJS.NodeJS.LTS    # 或官网 MSI：https://nodejs.org/

# Docker Desktop（含 BuildKit；WSL2 后端，仅 §4 / §5 需要）
winget install Docker.DockerDesktop
# 安装后启动 Docker Desktop，等鲸鱼图标变绿；建议 Settings → Resources 给足内存（≥4GB）

# gcloud CLI（仅 §5 Cloud Run 路径需要）
winget install Google.CloudSDK      # 或下载 GoogleCloudSDKInstaller.exe
gcloud init                        # 登录 + 选择项目
```

### 1.3 Linux 安装（Debian/Ubuntu 为例）

```bash
# Node.js（nvm）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24 && nvm use 24

# Docker Engine + BuildKit（buildx 随新版 Docker 自带，仅 §4 / §5 需要）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # 免 sudo 运行 docker；重新登录生效

# gcloud CLI（仅 §5 需要）
# 按 https://cloud.google.com/sdk/docs/install 选择对应发行版方式
gcloud init
```

---

## 2. 本地开发

```bash
git clone https://github.com/z451047442-debug/swarmlo
cd swarmlo/swarmlo/src/ruvocal
```

复制并编辑环境变量（**本地最小可用配置**——用 OpenRouter，与托管演示一致）：

```bash
# Linux / Windows Git Bash
cp .env .env.local

# Windows PowerShell
Copy-Item .env .env.local
```

`.env.local` 最小内容：

```env
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-v1-...        # 你的 OpenRouter key（https://openrouter.ai/keys）

# 可选：指定默认模型（不设则拉取 /models 列表）
TASK_MODEL=qwen/qwen3.6-max-preview
PUBLIC_APP_NAME=Swarmlo
```

启动：

```bash
npm install
npm run dev
# → http://localhost:5173
```

其他常用命令：

```bash
npm run build      # 生产构建
npm run preview    # 本地预览生产构建
npm run check      # TypeScript 校验（svelte-kit sync + svelte-check）
npm run test       # Vitest 测试
```

### 2.1 可选：本地 MongoDB 容器（开发期）

默认不设 `MONGODB_URL` 时用内嵌 MongoMemoryServer，数据存 `./db`，**不需要**任何数据库容器。
若想用真实 Mongo（调试 replica-set 特性等），`docker-compose.yml` 已备好开发容器：

```bash
docker compose up -d mongo
# 然后在 .env.local 中设置：
# MONGODB_URL=mongodb://localhost:27017
```

---

## 3. 纯本地生产（无 Docker，无 Cloud Run）

不需要容器也能以生产形态常驻本机（adapter-node 构建，与 Docker/Cloud Run 运行的是同一产物）：

```bash
npm run build
node build/index.js -- --host 0.0.0.0 --port 3000
# → http://localhost:3000（聊天记录仍存 ./db，与 dev 模式共享）
```

- 启动参数与仓库自己的 `entrypoint.sh` 完全一致（`node /app/build/index.js -- --host 0.0.0.0 --port 3000`），只是少了容器与 `mongod` 拉起逻辑——内嵌 MongoMemoryServer 已覆盖数据层。
- 适合常开主机 / NAS / 纯本机使用：无需 Docker、无需 gcloud、无需任何云账号（模型端点仍需要 `OPENAI_API_KEY`；本地 Ollama 则连这都不需要，见 §6 `OPENAI_BASE_URL`）。

### 3.1 后台常驻

```bash
# Linux / macOS（nohup，日志写文件）
nohup node build/index.js -- --host 0.0.0.0 --port 3000 > ruvocal.log 2>&1 &

# 或 pm2（跨平台，支持开机自启）
npm install -g pm2
pm2 start "node build/index.js -- --host 0.0.0.0 --port 3000" --name ruvocal
pm2 save && pm2 startup          # 按提示完成开机自启注册

# Windows：保持终端运行，或用"任务计划程序"创建开机启动项指向 node 命令
```

### 3.2 本地 MCP 工具（可选）

本仓库的 `mcp-bridge` 同样可以本地跑（Express，默认端口 **3001**，SSE 端点在 `/mcp/<组名>`）：

```bash
cd mcp-bridge && npm install && npm start
```

然后在 `.env.local` 里设 `MCP_SERVERS`（JSON 数组，`url` 形如 `http://localhost:3001/mcp/<组名>`，`transport` 为 `sse`，见 §6.3）。不需要聊天内工具调用可跳过。

---

## 4. Docker 自托管

### 4.1 构建（Windows / Linux 一致）

```bash
# 在 swarmlo/src/ruvocal 目录内
# INCLUDE_DB=true：从 mongo:7 镜像拷入 mongod，启动时自动拉起（零外部依赖）
docker build -t ruvocal --build-arg INCLUDE_DB=true .
```

> ⚠ Dockerfile 用了 BuildKit 语法（`COPY --link`、`--mount=type=cache`）。
> 若构建报 `Unknown flag: --link`，请显式开启：
> ```bash
> # Windows PowerShell
> $env:DOCKER_BUILDKIT=1
> # Linux bash
> export DOCKER_BUILDKIT=1
> ```

### 4.2 运行（内嵌 Mongo，数据卷持久化）

```bash
docker run -d --name ruvocal -p 3000:3000 \
  -e OPENAI_BASE_URL=https://openrouter.ai/api/v1 \
  -e OPENAI_API_KEY=sk-or-v1-... \
  -v ruvocal-data:/data \
  ruvocal
# → http://localhost:3000
```

Windows PowerShell 多行写法（反引号续行）：

```powershell
docker run -d --name ruvocal -p 3000:3000 `
  -e OPENAI_BASE_URL=https://openrouter.ai/api/v1 `
  -e OPENAI_API_KEY=sk-or-v1-... `
  -v ruvocal-data:/data `
  ruvocal
```

### 4.3 数据库方案三选一

| 方案 | 配置 | 适用 |
|------|------|------|
| 内嵌 Mongo（默认） | 构建时 `INCLUDE_DB=true`，挂载 `/data` 卷 | 单机自托管，零配置 |
| MongoDB Atlas（托管） | 只设 `MONGODB_URL=<连接串>`（不需要 INCLUDE_DB） | 多副本 / 需要备份的生产环境 |
| 本地 Mongo 容器 | 另起 `docker run -d -p 27017:27017 mongo:latest`，设 `MONGODB_URL` | 已有 Mongo 基础设施 |

`MONGODB_DB_NAME` 默认为 `chat-ui`（保留上游兼容），需要时按环境区分。

---

## 5. Google Cloud Run 生产部署

托管演示 flo.ruv.io 即由本仓库的 `cloudbuild.yaml` 全自动部署。下面拆解整个流程，用于部署你自己的实例。

### 5.1 cloudbuild.yaml 做了什么

| 阶段 | 步骤 | 关键点 |
|------|------|--------|
| ① 构建 | `docker build --build-arg INCLUDE_DB=true` | 必须带 `DOCKER_BUILDKIT=1`（文件内已设） |
| ② 推送 | push 到 `gcr.io/${PROJECT_ID}/ruvocal`，并打 `latest` 标签 | Artifact Registry 镜像 |
| ③ 部署 | `gcloud run deploy ruvocal` | us-central1 · 端口 3000 · 2 GiB 内存 · 2 CPU · 允许匿名访问 |

执行（Windows / Linux 命令一致）：

```bash
# 在 swarmlo/src/ruvocal 目录内（先用 gcloud init 登录并选定项目）
gcloud builds submit --config cloudbuild.yaml --substitutions _VERSION=v1
```

> ⚠ **`.gcloudignore` 是历史事故点**（ADR-033 标注 CRITICAL）：它决定哪些文件上传到 Cloud Build。
> 若构建上下文缺文件（如 `.env`），先检查 `.gcloudignore` 是否误排除。

### 5.2 首次环境变量配置（带外操作，必须手动）

`cloudbuild.yaml` 的部署步骤**故意不带** `--set-env-vars` / `--set-secrets`——
否则每次重建会用空环境覆盖手工配置（ADR-033 记录的 bug 修复）。首次部署后需手动配置：

```bash
# 用 Secret Manager 存密钥（推荐）
gcloud secrets create ruvocal-openrouter-key --replication-policy=automatic
echo -n "sk-or-v1-..." | gcloud secrets versions add ruvocal-openrouter-key --data-file=-

# 授权 Cloud Run 服务账号读取
gcloud secrets add-iam-policy-binding ruvocal-openrouter-key \
  --member=serviceAccount:$(gcloud projects describe $(gcloud config get-value project) \
  --format='value(projectNumber)')-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# 注入运行环境（--update-secrets 映射 Secret，--update-env-vars 设普通变量）
gcloud run services update ruvocal --region us-central1 \
  --update-env-vars OPENAI_BASE_URL=https://openrouter.ai/api/v1,PUBLIC_APP_NAME=Swarmlo \
  --update-secrets OPENAI_API_KEY=ruvocal-openrouter-key:latest
```

另一种方式是整文件注入（`entrypoint.sh` 支持）：把完整 env 内容放进 `DOTENV_LOCAL` 环境变量（或 Secret），启动时自动写入 `/app/.env.local`。

### 5.3 自定义域名（托管演示为 Cloudflare 托管）

```bash
gcloud run domain-mappings create --service ruvocal --domain flo.example.com --region us-central1
# 输出一组 DNS 记录
```

到 DNS 服务商（托管演示用 **Cloudflare，CNAME 不代理**——不点橙色云，让 Google 签发证书）添加输出中的记录，等待生效后访问即自动 HTTPS。

### 5.4 ⚠ 数据持久化（Cloud Run 的必知坑）

Cloud Run 容器文件系统**每次冷启动丢弃**——内嵌 Mongo 里的聊天记录会随冷启动消失。
托管演示接受这一点（验证用途），生产环境三选一（ADR-033 P1 清单，按推荐排序）：

1. **MongoDB Atlas M0 免费层**（推荐）：`MONGODB_URL` 存进 Secret Manager，按 §5.2 注入；记得 Atlas 侧 allow-list 放行 Cloud Run 出口 IP。
2. **Cloud Run 多容器修订**：`mongo:8` sidecar + 挂载 GCS 卷。
3. **Compute Engine 自建 Mongo**：开销最大，仅已有基础设施时考虑。

### 5.5 配套服务：mcp-bridge（可选）

托管演示另部署了 `swarmlo/src/ruvocal/mcp-bridge/`（独立 Cloud Run 服务，自带 `cloudbuild.yaml`），对外暴露 5 组共 200+ 个 MCP 工具。要点：

- 固定 `--min-instances=1 --max-instances=1` 保持常驻（冷启动会来不及拉起 `npx ... mcp start`）
- MCP `initialize` RPC 超时已从 30s 调到 120s
- 部署后在 ruvocal 侧用 `MCP_SERVERS` 环境变量指向它的 SSE 端点（形如 `https://<服务名>-<hash>.run.app/mcp/<组名>`）

自托管如果不需要聊天内工具调用，可完全跳过此服务。

---

## 6. 环境变量参考

### 6.1 核心

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `OPENAI_BASE_URL` | ✅ | OpenAI 兼容端点（OpenRouter：`https://openrouter.ai/api/v1`；本地 Ollama：`http://127.0.0.1:11434/v1`） |
| `OPENAI_API_KEY` | ✅ | 对应端点的 key |
| `MONGODB_URL` | 否 | 不设则内嵌 MongoMemoryServer 持久化到 `./db`（容器内为 `/data/db`） |
| `MONGODB_DB_NAME` | 否 | 默认 `chat-ui` |
| `DOTENV_LOCAL` | 否 | 整段 env 文本，启动时写入 `.env.local`（Cloud Run 注入方案之一） |

### 6.2 模型与品牌

| 变量 | 说明 |
|------|------|
| `TASK_MODEL` | 默认模型（如 `qwen/qwen3.6-max-preview`）；不设则自动拉 `/models` |
| `MODELS` | 显式模型列表（JSON） |
| `PUBLIC_APP_NAME` / `PUBLIC_APP_DESCRIPTION` / `PUBLIC_APP_ASSETS` | 品牌名 / 描述 / 静态资源目录 |

### 6.3 MCP 与路由（可选）

| 变量 | 说明 |
|------|------|
| `MCP_SERVERS` | JSON 数组：`[{"name":"...","url":"https://...","transport":"sse"}]` |
| `LLM_ROUTER_*` | Omni 智能路由系列（`LLM_ROUTER_ENABLE_TOOLS`、`LLM_ROUTER_ROUTES_PATH` 等） |

> `MCP_SERVERS` 的 `url` 不限于公网端点——本地自托管时指向本机 SSE 端点即可（如 mcp-bridge 本地运行，见 §3.2）。

完整变量清单见 `.env` 文件与 `src/lib/server/` 内的读取点。

---

## 7. Windows / Linux 差异速查

| 场景 | Windows | Linux |
|------|---------|-------|
| 容器运行时 | Docker Desktop（WSL2 后端，注意给足内存） | Docker Engine 原生 |
| BuildKit 开启 | `$env:DOCKER_BUILDKIT=1` | `export DOCKER_BUILDKIT=1` |
| docker run 多行 `-e` | 反引号 `` ` `` 续行 | `\` 续行 |
| 复制 env | `Copy-Item .env .env.local` | `cp .env .env.local` |
| 环境变量写入 | PowerShell 需注意引号转义 | bash 直接写 |
| 端口占用排查 | `netstat -ano \| findstr :3000` | `ss -tulpn \| grep 3000` |

---

## 8. 故障排查

### 8.1 构建报 `Unknown flag: --link` / BuildKit 相关

Dockerfile 是 BuildKit 语法。按 §4.1 开启 `DOCKER_BUILDKIT=1`（cloudbuild.yaml 内已自动设置）。

### 8.2 容器启动即退出，日志提示找不到 DOTENV_LOCAL

`entrypoint.sh` 找不到 `.env.local` 且未设 `DOTENV_LOCAL` 时仅告警不退出；若实际退出，检查 `docker logs ruvocal` 定位具体错误（多为端口冲突或 Mongo 启动失败）。

### 8.3 聊天记录重启后消失

Cloud Run 易失文件系统（§5.4）或本地未挂载卷。自托管确认 `-v ruvocal-data:/data`；Cloud Run 接 Atlas。

### 8.4 工具调用全部失败

`MCP_SERVERS` 未配置或端点不可达。检查 JSON 格式（是数组）、`transport` 字段（`sse` / `streamable-http`）、以及桥接服务的常驻设置（§5.5）。

### 8.5 模型报 400 / 无响应

- key 无效或额度不足 → 用 `curl` 直测端点：`curl https://openrouter.ai/api/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`
- `MODELS` 显式列表与端点不符 → 清空该变量让应用自动拉取
- 切换模型供应商时注意 `OPENAI_BASE_URL` 与 key 需同时更换

### 8.6 Cloud Run 部署后 404 / 环境变量丢失

环境变量是带外配置（§5.2）。若重新跑了 `gcloud run deploy` 又丢配置，确认没有在 deploy 命令里带空 env 覆盖。

### 8.7 Cloud Build 上传文件不全

检查 `.gcloudignore`（§5.1 的历史事故点），确认 `.env`、`entrypoint.sh`、`package*.json` 未被排除。

### 8.8 本地冒烟测试（§2 / §3 路径）

服务没有 `/healthcheck` 端点，用页面状态码验证：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/          # 期望 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/settings  # 期望 200
```

失败时看 `node build/index.js` 的终端输出——端口冲突、构建未完成、`.env.local` 缺失都会在那里报错。

---

## 参考

- 架构与历史决策：[ADR-033（RUVOCAL WASM-MCP 集成）](../../../docs/adr/ADR-033-RUVOCAL-WASM-MCP-INTEGRATION.md)
- 部署流水线：`../cloudbuild.yaml`（主服务）· `../mcp-bridge/cloudbuild.yaml`（MCP 桥接）
- 路线图：[issue #1689](https://github.com/z451047442-debug/swarmlo/issues/1689)
- 上游：`huggingface/chat-ui`（RuVocal 由 v0.20.0 派生）
