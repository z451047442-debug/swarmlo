# Swarmlo Research（goal.ruv.io）部署指南

> 本文面向自托管与生产部署，覆盖 Windows 与 Linux 两条路径。
> 托管演示：[goal.ruv.io](https://goal.ruv.io/)（目标规划）· [goal.ruv.io/agents](https://goal.ruv.io/agents)（实时智能体仪表盘）。
> 源码：`v3/goal_ui/`。技术栈：React 18 · TypeScript 5 · Vite 5 · Tailwind 3 · Supabase（Postgres + Auth + Edge Functions）· GOAP A* 规划器。

## 0. 部署路径一览

| 路径 | 适用场景 | 后端 | 前端 | 小节 |
|------|---------|------|------|------|
| 纯本地部署 | 个人使用 / 离线调试，无任何云账号 | 5 个函数以 Deno 直跑 + `scripts/local-router.ts` | `npm run dev`（localhost:8080） | §2 |
| 云端部署 | 公网访问（托管演示 goal.ruv.io 即此路径） | Supabase Edge Functions | Netlify 静态托管 | §3 |

云端路径的两段式架构：

```
浏览器
  │  VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY（随构建注入）
  ▼
① Netlify（静态托管）          ── 托管 Vite 构建产物 dist/（含 widget.js / widget.css）
  │  ・SPA 路由回退（netlify.toml 中的 _redirects）
  │  ・widget 文件 CORS 头（供第三方站点嵌入）
  ▼
② Supabase（托管后端）
  │  ・Postgres 数据库 + Auth
  └── 5 个 Edge Functions（Deno 运行时，部署在 supabase/functions/ 下）
      generate-research-goal / research-step / research-api /
      generate-action-items / optimize-research-config
```

- 5 个函数已改造成**双用途模块**（`export handler` + `if (import.meta.main)` 守卫）：本地可直接跑，云端仍可 `supabase functions deploy`，两条路互不破坏。
- 任何能托管静态文件的平台（Vercel / Cloudflare Pages / Nginx）都可替代 Netlify（§3.4）。

---

## 1. 前置条件

### 1.1 通用要求

| 依赖 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | **18+**（Netlify 构建需 `NODE_VERSION=18` 或更高） | 本地开发 / 构建 |
| npm | 9+（随 Node 附带） | 依赖安装 |
| Git | 任意近期版本 | 克隆仓库 / Netlify Git 集成 |
| Deno | 2.x（**仅纯本地路径**） | 本机运行 5 个函数 |
| Supabase CLI | 1.150+（**仅云端路径**） | 登录、关联项目、函数部署 |
| Netlify CLI | 任意近期版本（可选，CLI 手动部署时需要） | `netlify deploy` |

### 1.2 Windows 安装

```powershell
# 方式一：官网 MSI 安装包（推荐，含 npm）
#   Node.js LTS：https://nodejs.org/  → 一路下一步

# 方式二：winget（PowerShell 管理员）
winget install OpenJS.NodeJS.LTS
winget install Git.Git          # ⚠ 必须装 Git for Windows——见下方"cp 坑"

# CLI 工具（按部署路径选择，按需）
winget install DenoLand.Deno                  # 纯本地路径
npm install -g supabase                       # 云端路径
npm install -g netlify-cli                    # 云端路径（可选）
```

> **⚠ Windows 重要坑：npm 脚本里的 `cp`。** `package.json` 的 `copy:widget` /
> `copy:widget-to-dist` 脚本使用了 POSIX 命令 `cp`。npm 在 Windows 上默认用
> **cmd.exe** 执行脚本，会报 `'cp' 不是内部或外部命令`，导致 `npm run build` 中途失败。
> 解法二选一：
>
> ```powershell
> # 解法 A（推荐）：在 Git Bash 里执行所有 npm 命令（装好 Git for Windows 自带）
> # 开始菜单 → Git Bash → cd 到项目目录 → npm install && npm run build
>
> # 解法 B：让 npm 全局用 Git Bash 执行脚本（PowerShell 中运行一次）
> npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"
> ```

### 1.3 Linux 安装（Debian/Ubuntu 为例）

```bash
# Node.js 18+（nvm 方式，推荐——版本可切换）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20

# 或发行版包管理器（版本可能偏旧，确认 >= 18）
# sudo apt update && sudo apt install -y nodejs npm

# Deno（纯本地路径）
curl -fsSL https://deno.land/install.sh | sh

# CLI 工具（云端路径，按需）
npm install -g supabase
npm install -g netlify-cli
```

---

## 2. 纯本地部署（无 Supabase / 无 Docker，推荐个人使用）

不想用任何云服务时，前端照常跑，5 个函数在本机以 Deno 运行，`scripts/local-router.ts`
在 `localhost:54321` 把 `/functions/v1/<name>` 分发到 5 个 handler——URL 约定与前端
`supabase.functions.invoke()` 完全一致，前端代码零改动。

> ⚠ 本地化去掉的是 Supabase，**不是** AI 推理本身：每次研究调用仍会请求模型端点。
> 端点通过 `AI_BASE_URL` / `AI_API_KEY` 配置（默认指向 Lovable 网关，可换成任意
> OpenAI 兼容供应商——DeepSeek、OpenRouter、本地 Ollama 等），见 §2.2。

### 2.1 前端准备

```bash
# Windows：在 Git Bash 中执行；Linux：直接执行
git clone https://github.com/z451047442-debug/swarmlo
cd swarmlo/v3/goal_ui
npm install
```

复制 `example.env` → `.env`，改为本地值（`.env` 已被 gitignore 覆盖）：

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_dev_only   # 本地函数不校验 JWT，占位即可
VITE_SUPABASE_PROJECT_ID=local
```

### 2.2 后端：Deno + 本地路由

```bash
# 装 Deno（§1）；winget 安装后需新开终端才能直接用 deno 命令

# 放模型端点配置（.env.local 已被 .gitignore 的 *.local 规则覆盖，不会误提交）
echo "AI_API_KEY=你的key" > .env.local

# 启动后端（v3/goal_ui 目录内）
deno run --allow-net --allow-env --env-file=.env.local scripts/local-router.ts
# → [local-router] serving 5 functions on http://localhost:54321
```

> 首次运行会自动下载远程依赖（`deno.land/std@0.168.0` 等），版本由仓库内的
> `deno.lock` 钉住——该文件应随仓库提交，保证任何时候拉下来运行结果一致。

常用端点示例（`.env.local` 里按需加 `AI_BASE_URL` / `AI_MODEL`）：

```env
# DeepSeek（国内直连、人民币计费）
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat

# 本地 Ollama（完全免费，需自备模型）
# AI_BASE_URL=http://127.0.0.1:11434/v1
# AI_MODEL=qwen2.5:14b

# AI_ENABLE_SEARCH=1 时 research-step 附带 Gemini 联网搜索工具（仅支持的端点有效）
```

### 2.3 启动前端

```bash
npm run dev
# → http://localhost:8080        （端口定义在 vite.config.ts）
# → http://localhost:8080/agents （智能体仪表盘）
```

无 key 冒烟测试（路由连通性零成本可验证）：

```bash
curl http://localhost:54321/functions/v1/nonexistent
# → 404 + 可用函数清单（路由活着）
curl -X POST http://localhost:54321/functions/v1/research-step \
  -H "Content-Type: application/json" -d '{}'
# → 500 "AI_API_KEY is not configured"（分发到真实 handler 且密钥检查生效）
```

限制：仅本机可访问（无公网 URL），widget 无法被第三方站点嵌入；需要公网走 §3。

### 2.4 常用命令

```bash
npm run widget:dev               # Widget 开发模式（产出 dist/widget.js + dist/widget.css，复制进 public/）
npm run build                    # widget 构建 → 主应用构建 → 产物归位到 dist/
npm run preview                  # → http://localhost:4173（含 /demo 演示页，纯本地生产形态）
```

> ℹ 数据说明：goal_ui 没有数据库。设置等少量数据存浏览器 localStorage；**研究目标、
> 步骤与结果保存在页面内存（React state）中，刷新页面即丢失**。纯本地模式没有任何
> 数据离开你的电脑——唯一例外是每次研究调用发给 Lovable AI 网关的请求内容。

---

## 3. 云端部署（Supabase + Netlify，托管演示路径）

### 3.1 创建 Supabase 项目并关联

1. 打开 [supabase.com/dashboard](https://supabase.com/dashboard)，Sign in 后 **New project**。
2. 记下关键信息：
   - **Project ID / Reference**（如 `abcdefghijklm`）→ 对应 `VITE_SUPABASE_PROJECT_ID`
   - **Project URL**（如 `https://abcdefghijklm.supabase.co`）→ 对应 `VITE_SUPABASE_URL`
3. 免费层即可跑通全部 5 个函数（注意免费项目闲置 7 天会暂停，需要去 Dashboard 手动恢复）。

```bash
supabase login                 # 浏览器完成 OAuth 授权

# 在 v3/goal_ui 目录内关联你的云项目（supabase/config.toml 已存在，无需 init）
supabase link --project-ref <你的-project-id>
```

### 3.2 部署 5 个 Edge Functions

```bash
# 部署全部函数（一次性）
supabase functions deploy

# 或按需逐个部署
supabase functions deploy generate-research-goal
supabase functions deploy research-step
supabase functions deploy research-api
supabase functions deploy generate-action-items
supabase functions deploy optimize-research-config

# 验证
supabase functions list
# 应在输出中看到全部 5 个函数为 ACTIVE 状态
```

函数源文件在 `supabase/functions/<函数名>/index.ts`，修改后重新执行上面的 deploy 即可热更新（旧实例立即被替换）。

### 3.3 Edge Functions 服务端 Secrets

**`AI_API_KEY` 是 5 个函数全部必配的 secret**（缺了所有研究调用返回 500
`"AI_API_KEY is not configured"`；`LOVABLE_API_KEY` 仍可作回退）。函数内部需要的
其他服务端凭据（如 `SUPABASE_SERVICE_ROLE_KEY`）同理，**不要**放在前端 `.env`：

1. Dashboard → **Edge Functions → Secrets** → Add secret。
2. 填入 `AI_API_KEY` 及函数实际读取的其他 key（如 `AI_BASE_URL` / `AI_MODEL`，参考 §4.2）。
3. Secrets 在函数运行时通过环境变量注入，重新部署函数后生效。

### 3.4 Netlify 部署（前端）

仓库内的 `netlify.toml` 已配好全部规则，无需额外配置：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| Build command | `npm run build` | widget → 主应用 → 产物归位 dist/ |
| Publish directory | `dist` | Vite 构建产物 |
| SPA 回退 | `/* → /index.html`（200） | 支持 `/agents` 等客户端路由直链 |
| CORS 头 | `/widget.js`、`/widget.css` | 供第三方站点跨域嵌入 |
| 缓存 | `/assets/*` 1 年 immutable | 静态资源长缓存 |

**方式 A：Git 集成自动部署（推荐）**

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**，连接 GitHub，选中 `z451047442-debug/swarmlo`。
2. **Base directory** 设为 `v3/goal_ui`。
3. Build settings 会自动读取 `netlify.toml`；在 Environment variables 中确认 `NODE_VERSION=18`（或更高）。
4. Deploy。此后每次 push 自动构建发布。

**方式 B：CLI 手动部署（Windows / Linux 命令一致）**

```bash
# 在 v3/goal_ui 目录内（Windows 记得在 Git Bash 里执行）
npm run build

# 首次：登录并初始化站点（交互式选择 team / 站点名）
netlify login
netlify init

# 生产部署（也可用 netlify deploy 发 preview 链接先验证）
netlify deploy --prod --dir=dist
```

### 3.5 前端环境变量与自定义域名

Netlify 站点 → **Site configuration → Environment variables**，添加 §4.1 中的三个 `VITE_*` 变量。
由于是构建时注入，**修改后必须重新触发一次部署**（Retry deploy 即可）才会生效。

域名（可选）：

1. 站点 → **Domain settings → Add a domain**，输入你的域名（托管演示即 `goal.ruv.io`）。
2. 按提示到你的 DNS 服务商添加记录：
   - 裸域名：`A` 记录指向 Netlify 负载均衡地址，或 `ALIAS`/`ANAME`（取决于服务商）
   - 子域名（推荐，如 `goal.example.com`）：`CNAME` 指向 `apex-loadbalancer.netlify.com`
3. 等待 DNS 生效，Netlify 自动签发 Let's Encrypt 证书并启用 HTTPS。

---

## 4. 环境变量参考

### 4.1 前端（`.env` / Netlify，随 Vite 构建注入）

| 变量 | 纯本地 | 云端 | 说明 |
|------|:------:|:----:|------|
| `VITE_SUPABASE_URL` | `http://localhost:54321` | ✅ | Supabase 项目 URL（本地指向 local-router） |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 占位 `sb_publishable_*` 即可 | ✅ | 浏览器可公开的 publishable key |
| `VITE_SUPABASE_PROJECT_ID` | `local` | ✅ | Supabase Project Reference |

取值位置（云端）：Supabase Dashboard → **Project Settings → API Keys**。

> ⚠ 不要用 `anon` key 或 `service_role` key 填 `VITE_SUPABASE_PUBLISHABLE_KEY`：
> 前端代码（`src/integrations/supabase/client.ts`）明确读取 publishable key，
> 且 `service_role` key 会绕过行级安全策略，**绝不能**出现在浏览器代码里。
> 旧版文档中 `VITE_SUPABASE_ANON_KEY` 的说法已过时，以 `example.env` 为准。

### 4.2 服务端（仅 Edge Functions Secrets / `.env.local`，禁止进前端）

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `AI_API_KEY` | ✅ | 模型端点 key——5 个函数全部依赖，缺失即 500（旧名 `LOVABLE_API_KEY` 仍可作回退） |
| `AI_BASE_URL` | 否 | OpenAI 兼容端点；默认 `https://ai.gateway.lovable.dev/v1` |
| `AI_MODEL` | 否 | 模型名覆盖；默认 `google/gemini-2.5-flash`（如 DeepSeek 填 `deepseek-chat`） |
| `AI_ENABLE_SEARCH` | 否 | `1` 时 research-step 附带 Gemini 联网搜索工具（仅支持的端点有效） |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` | 按需 | 函数需要 Supabase 服务端凭据时配置（云端 §3.3） |

---

## 5. Windows / Linux 差异速查

| 场景 | Windows | Linux |
|------|---------|-------|
| 执行 npm 命令 | **在 Git Bash 里执行**（npm 脚本含 `cp`） | 任意 shell |
| 复制 .env | `Copy-Item example.env .env`（PowerShell）或 `cp`（Git Bash） | `cp example.env .env` |
| 多行环境变量 | PowerShell 用反引号 `` ` `` 续行 | bash 用 `\` 续行 |
| Node 安装 | 官网 MSI / `winget install OpenJS.NodeJS.LTS` | `nvm install 20` |
| Deno 安装 | `winget install DenoLand.Deno`（装完新开终端） | `curl -fsSL https://deno.land/install.sh \| sh` |
| CLI 全局安装 | `npm install -g supabase`（同上） | 同上 |
| 端口占用排查 | `netstat -ano \| findstr :8080` | `ss -tulpn \| grep 8080` |

---

## 6. 故障排查

### 6.1 `npm run build` 报 `'cp' 不是内部或外部命令`（仅 Windows）

原因见 §1.2。在 Git Bash 里执行，或 `npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"`。

### 6.2 widget.js / widget.css 返回 404

1. 确认构建日志中 `BUILD_WIDGET=true vite build` 阶段成功（`build` 脚本先跑 widget 构建）。
2. 确认部署产物 `dist/` 里存在 `widget.js`、`widget.css`、`widget-embed.html`。
3. Netlify 上：Site settings → Build & deploy → **Clear cache and retry deploy**。

### 6.3 外部站点嵌入 widget 时 CORS 报错

`netlify.toml` 已为 `/widget.js`、`/widget.css` 配置 `Access-Control-Allow-Origin: *`。
若自行托管到其他平台，需等价地把 `public/_headers` 的内容原样下发。

### 6.4 直链 `/agents`、`/demo` 返回 404

SPA 回退必须放在**最后一条** redirect 规则之后生效。`netlify.toml` 与 `public/_redirects` 已按此顺序配置；其他托管平台请保证 `/* → /index.html (200)` 是兜底规则。

### 6.5 页面报 Supabase 连接失败 / key 无效

1. `.env` 或 Netlify 环境变量缺失 → 检查三个 `VITE_*` 是否齐全（§4.1）。
2. key 类型错误 → 云端必须是 **publishable key**（`sb_publishable_` 前缀）；纯本地为占位值即可。
3. 改了 Netlify 环境变量但没重新部署 → 构建时注入，需 Retry deploy。

### 6.6 研究功能调用返回 500

1. 纯本地：`AI_API_KEY` 未放 `.env.local` 或路由未启动 → 见 §2.2 / §2.3 冒烟测试。
2. 云端：函数未部署（`supabase functions list` 确认 5 个函数 ACTIVE）；Secrets 缺 `AI_API_KEY`（§3.3）；免费项目被暂停（Dashboard 手动 Restore）。

### 6.7 本地 dev 能跑但生产空白

生产走 `npm run build`（含 widget 构建步骤），dev 走 `vite dev`——两者产物不同。
务必用 `npm run build && npm run preview` 验证生产产物后再部署。

### 6.8 本地路由端口 54321 被占用

换端口启动并同步前端配置：

```bash
PORT=54322 deno run --allow-net --allow-env --env-file=.env.local scripts/local-router.ts
# 同时把 .env 的 VITE_SUPABASE_URL 改为 http://localhost:54322
```

Windows 排查占用：`netstat -ano | findstr :54321`；Linux：`ss -tulpn | grep 54321`。

---

## 7. Widget 嵌入（部署后可用）

```html
<div id="swarmlo-research-widget-container"></div>
<script>
  window.SwarmloResearchWidgetConfig = { primaryColor: "#8b5cf6", accentColor: "#10b981" };
</script>
<link rel="stylesheet" href="https://你的域名/widget.css">
<script src="https://你的域名/widget.js"></script>
```

完整集成指南见 [`docs/WIDGET-INTEGRATION.md`](WIDGET-INTEGRATION.md)。
Widget 文件带 1 年 immutable 缓存（`public/_headers`）；发新版后如需强制刷新，可在 URL 加版本查询参数或重命名文件。
