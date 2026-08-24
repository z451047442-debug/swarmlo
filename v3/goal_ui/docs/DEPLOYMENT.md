# Swarmlo Research（goal.ruv.io）部署指南

> 本文面向自托管与生产部署。本地部署按操作系统分两条完整路径：**§1 Windows 一条走到底，§2 Linux 一条走到底**（不再穿插）；云端部署与操作系统无关，见 §3。
> 托管演示：[goal.ruv.io](https://goal.ruv.io/)（目标规划）· [goal.ruv.io/agents](https://goal.ruv.io/agents)（实时智能体仪表盘）。
> 源码：`v3/goal_ui/`。技术栈：React 18 · TypeScript 5 · Vite 5 · Tailwind 3 · Supabase（Postgres + Auth + Edge Functions）· GOAP A* 规划器。

## 0. 部署路径一览

| 路径 | 适用场景 | 后端 | 前端 | 小节 |
|------|---------|------|------|------|
| Windows 本地 | 个人使用 / 离线调试 | 5 个函数以 Deno 直跑 + `scripts/local-router.ts` | `npm run dev`（localhost:8080）或 `npm run preview`（生产形态 4173） | §1 |
| Linux 本地 | 个人使用 / 服务器 | 同上 | 同上 | §2 |
| 云端部署 | 公网访问（托管演示 goal.ruv.io 即此路径） | Supabase Edge Functions | Netlify 静态托管 | §3 |

- 5 个函数已改造成**双用途模块**（`export handler` + `if (import.meta.main)` 守卫）：本地可直接跑，云端仍可 `supabase functions deploy`，两条路互不破坏。
- 任何能托管静态文件的平台（Vercel / Cloudflare Pages / Nginx）都可替代 Netlify（§3.4）。
- goal_ui **没有数据库**：设置与会话状态持久化在浏览器 localStorage（`swarmlo-research-session-v1`），刷新页面自动恢复上次会话，点 "New Research" 清空。

---

## 1. Windows 完整路径

### 1.1 安装

```powershell
# Node.js LTS（含 npm）——官网 MSI 或 winget 二选一
winget install OpenJS.NodeJS.LTS

# Git for Windows（克隆仓库需要）
winget install Git.Git

# Deno 2.x（跑本地后端 5 个函数）
winget install DenoLand.Deno
```

> ⚠ **Deno 装完找不到命令？** winget 安装后 PATH 未刷新时 `deno` 命令不可用。
> 重开终端即可；若仍找不到，用 winget 包目录下的完整路径启动（见 §1.3）。

### 1.2 配置

```bash
git clone https://github.com/z451047442-debug/swarmlo
cd swarmlo/v3/goal_ui
npm install
```

两个环境文件（均已 gitignore，不会误提交）：

**① `.env`（前端）**——复制 `example.env` 改名 `.env`，改成本地值：

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_dev_only   # 本地函数不校验 JWT，占位即可
VITE_SUPABASE_PROJECT_ID=local
# 可选：前端默认 AI 模型（不设则默认 google/gemini-2.5-flash，与 DeepSeek 混用会 400）
VITE_AI_MODEL=deepseek-v4-pro
```

**② `.env.local`（后端）**——直接新建：

```env
AI_API_KEY=sk-你的key                 # 必填：模型端点 key（https://platform.deepseek.com/api_keys）
AI_BASE_URL=https://api.deepseek.com/v1   # 可选：默认 Lovable 网关；换 DeepSeek/OpenRouter/本地 Ollama 均可
AI_MODEL=deepseek-v4-pro              # 可选
```

> ⚠ 两个文件的**值必须纯 ASCII**（key、URL 都不能含中文），注释可以用中文。

### 1.3 启动后端（Deno local-router）

```bash
# 在 v3/goal_ui 目录内
deno run --allow-net --allow-env --env-file=.env.local scripts/local-router.ts
# → [local-router] serving 5 functions on http://localhost:54321

# deno 命令找不到时用 winget 完整路径：
#   "$LOCALAPPDATA/Microsoft/WinGet/Packages/DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe/deno.exe" run --allow-net --allow-env --env-file=.env.local scripts/local-router.ts
```

### 1.4 启动前端并验证

```bash
# 开发形态
npm run dev
# → http://localhost:8080        （端口定义在 vite.config.ts）
# → http://localhost:8080/agents （智能体仪表盘）

# 生产形态（构建产物 + 静态预览）
npm run build
npm run preview
# → http://localhost:4173        （含 /demo 演示页）
```

后端冒烟测试（零成本验证路由连通）：

```bash
curl http://localhost:54321/functions/v1/nonexistent
# → 404 + 可用函数清单（路由活着）
```

### 1.5 Windows 特有坑位速查

| 坑 | 状态 | 说明 |
|----|------|------|
| npm 脚本的 `cp` / `BUILD_WIDGET=true` | ✅ 已修复 | 构建脚本已跨平台化（`shx` + `cross-env`），PowerShell / cmd / Git Bash 里 `npm run build` 均可 |
| Deno 装完命令找不到 | 常见 | PATH 未刷新，见 §1.1 提示与 §1.3 完整路径 |
| 端口占用排查 | — | `netstat -ano \| findstr :8080`（前端）、`netstat -ano \| findstr :54321`（后端） |

---

## 2. Linux 完整路径

### 2.1 安装

```bash
# Node.js 18+（nvm）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20

# Deno 2.x（本地后端）
curl -fsSL https://deno.land/install.sh | sh
source ~/.bashrc
```

### 2.2 配置

环境文件内容与 §1.2 **完全相同**：`example.env` → `.env`（改三个 `VITE_*` 值 + 可选 `VITE_AI_MODEL`），直接新建 `.env.local`（`AI_API_KEY` 等三行）。

```bash
git clone https://github.com/z451047442-debug/swarmlo
cd swarmlo/v3/goal_ui
npm install
cp example.env .env          # 然后编辑 .env（内容见 §1.2）
```

### 2.3 启动

```bash
# 后端（v3/goal_ui 目录内）
deno run --allow-net --allow-env --env-file=.env.local scripts/local-router.ts
# → http://localhost:54321

# 前端（另开终端）
npm run dev                  # → http://localhost:8080
# 或生产形态：
npm run build && npm run preview   # → http://localhost:4173
```

### 2.4 验证

```bash
curl http://localhost:54321/functions/v1/nonexistent   # → 404 + 函数清单
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080   # → 200
```

---

## 3. 常用命令（两种系统通用）

```bash
npm run widget:dev               # Widget 开发模式（产出 dist/widget.js + dist/widget.css，复制进 public/）
npm run build                    # widget 构建 → 主应用构建 → 产物归位到 dist/
npm run preview                  # → http://localhost:4173（含 /demo 演示页，纯本地生产形态）
```

> 导出：报告弹窗「导出」下拉支持 Markdown (.md) / Word (.docx) / PDF (.pdf)；
> 「后续步骤」页签的「导出清单」支持 Markdown / Excel (.xlsx) / Word。
> PDF 内嵌 Noto Sans SC 中文字体（`public/fonts/`，OFL 许可），Word 使用系统等线字体。
> 生成库按需懒加载，不影响首屏。

> ℹ 纯本地模式没有任何数据离开你的电脑——唯一例外是每次研究调用发给 AI 端点的请求内容。
> 模型端点通过 `.env.local` 的 `AI_BASE_URL` 配置（默认 Lovable 网关，可换成任意 OpenAI 兼容供应商——DeepSeek、OpenRouter、本地 Ollama 等）。`AI_ENABLE_SEARCH=1` 时 research-step 附带 Gemini 联网搜索工具（仅支持的端点有效）；DeepSeek 端点已内置官方联网搜索适配（Responses API web_search）。

---

## 4. 云端部署（Supabase + Netlify，托管演示路径）

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

### 4.1 创建 Supabase 项目并关联

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

### 4.2 部署 5 个 Edge Functions

```bash
supabase functions deploy        # 一次性部署全部
# 或按需逐个部署：supabase functions deploy <函数名>
supabase functions list          # 确认 5 个函数 ACTIVE
```

函数源文件在 `supabase/functions/<函数名>/index.ts`，修改后重新 deploy 即热更新。

### 4.3 Edge Functions 服务端 Secrets

**`AI_API_KEY` 是 5 个函数全部必配的 secret**（缺了所有研究调用返回 500 `"AI_API_KEY is not configured"`；`LOVABLE_API_KEY` 仍可作回退）。其他服务端凭据同理，**不要**放在前端 `.env`：

1. Dashboard → **Edge Functions → Secrets** → Add secret。
2. 填入 `AI_API_KEY` 及函数实际读取的其他 key（如 `AI_BASE_URL` / `AI_MODEL`，见 §5.2）。
3. Secrets 在函数运行时通过环境变量注入，重新部署函数后生效。

### 4.4 Netlify 部署（前端）

仓库内的 `netlify.toml` 已配好全部规则，无需额外配置：

| 配置项 | 值 | 说明 |
|------|-----|------|
| Build command | `npm run build` | widget → 主应用 → 产物归位 dist/ |
| Publish directory | `dist` | Vite 构建产物 |
| SPA 回退 | `/* → /index.html`（200） | 支持 `/agents` 等客户端路由直链 |
| CORS 头 | `/widget.js`、`/widget.css` | 供第三方站点跨域嵌入 |
| 缓存 | `/assets/*` 1 年 immutable | 静态资源长缓存 |

**方式 A：Git 集成自动部署（推荐）**

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**，连接 GitHub，选中 `z451047442-debug/swarmlo`。
2. **Base directory** 设为 `v3/goal_ui`。
3. Build settings 自动读取 `netlify.toml`；确认 `NODE_VERSION=18`（或更高）。
4. Deploy。此后每次 push 自动构建发布。

**方式 B：CLI 手动部署**

```bash
# 在 v3/goal_ui 目录内
npm run build
netlify login
netlify init
netlify deploy --prod --dir=dist
```

### 4.5 前端环境变量与自定义域名

Netlify 站点 → **Site configuration → Environment variables**，添加 §5.1 中的 `VITE_*` 变量（构建时注入，修改后必须重新触发一次部署）。

域名（可选）：

1. 站点 → **Domain settings → Add a domain**，输入你的域名（托管演示即 `goal.ruv.io`）。
2. 按提示到 DNS 服务商添加记录（裸域名用 `A`/`ALIAS`，子域名推荐 `CNAME` 指向 `apex-loadbalancer.netlify.com`）。
3. 等待 DNS 生效，Netlify 自动签发 Let's Encrypt 证书并启用 HTTPS。

---

## 5. 环境变量参考

### 5.1 前端（`.env` / Netlify，随 Vite 构建注入）

| 变量 | 纯本地 | 云端 | 说明 |
|------|:------:|:----:|------|
| `VITE_SUPABASE_URL` | `http://localhost:54321` | ✅ | Supabase 项目 URL（本地指向 local-router） |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 占位 `sb_publishable_*` 即可 | ✅ | 浏览器可公开的 publishable key |
| `VITE_SUPABASE_PROJECT_ID` | `local` | ✅ | Supabase Project Reference |
| `VITE_AI_MODEL` | 可选（如 `deepseek-v4-pro`） | 可选 | 前端默认 AI 模型（构建时注入）；不设则前端默认 `google/gemini-2.5-flash`，与 DeepSeek 端点混用时会导致 400 |

> ⚠ 不要用 `anon` key 或 `service_role` key 填 `VITE_SUPABASE_PUBLISHABLE_KEY`：
> 前端代码（`src/integrations/supabase/client.ts`）明确读取 publishable key，
> 且 `service_role` key 会绕过行级安全策略，**绝不能**出现在浏览器代码里。

### 5.2 服务端（仅 Edge Functions Secrets / `.env.local`，禁止进前端）

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `AI_API_KEY` | ✅ | 模型端点 key——5 个函数全部依赖，缺失即 500（旧名 `LOVABLE_API_KEY` 仍可作回退） |
| `AI_BASE_URL` | 否 | OpenAI 兼容端点；默认 `https://ai.gateway.lovable.dev/v1`（DeepSeek：`https://api.deepseek.com/v1`） |
| `AI_MODEL` | 否 | 模型名覆盖；默认 `google/gemini-2.5-flash`（DeepSeek 填 `deepseek-v4-pro` 或 `deepseek-v4-flash`） |
| `AI_ENABLE_SEARCH` | 否 | `1` 时 research-step 附带 Gemini 联网搜索工具（仅支持的端点有效） |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` | 按需 | 函数需要 Supabase 服务端凭据时配置（云端 §4.3） |

---

## 6. 故障排查

### 6.1 `npm run build` 报 `'cp' 不是内部或外部命令`（仅 Windows，旧 checkout）

构建脚本已改为跨平台实现（`cross-env` / `shx`），当前版本不会再出现。旧 checkout 上可临时
`npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"`，或直接 `git pull` 更新后重新 `npm install`。

### 6.2 widget.js / widget.css 返回 404

1. 确认构建日志中 `cross-env BUILD_WIDGET=true vite build` 阶段成功（`build` 脚本先跑 widget 构建）。
2. 确认部署产物 `dist/` 里存在 `widget.js`、`widget.css`、`widget-embed.html`。
3. Netlify 上：Site settings → Build & deploy → **Clear cache and retry deploy**。

### 6.3 外部站点嵌入 widget 时 CORS 报错

`netlify.toml` 已为 `/widget.js`、`/widget.css` 配置 `Access-Control-Allow-Origin: *`。
若自行托管到其他平台，需等价地把 `public/_headers` 的内容原样下发。

### 6.4 直链 `/agents`、`/demo` 返回 404

SPA 回退必须放在**最后一条** redirect 规则之后生效。`netlify.toml` 与 `public/_redirects` 已按此顺序配置；其他托管平台请保证 `/* → /index.html (200)` 是兜底规则。

### 6.5 页面报 Supabase 连接失败 / key 无效

1. `.env` 或 Netlify 环境变量缺失 → 检查三个 `VITE_*` 是否齐全（§5.1）。
2. key 类型错误 → 云端必须是 **publishable key**（`sb_publishable_` 前缀）；纯本地为占位值即可。
3. 改了 Netlify 环境变量但没重新部署 → 构建时注入，需 Retry deploy。

### 6.6 研究功能调用返回 500

1. 纯本地：`AI_API_KEY` 未放 `.env.local` 或路由未启动 → 见 §1.3 / §1.4 冒烟测试。
2. 云端：函数未部署（`supabase functions list` 确认 5 个函数 ACTIVE）；Secrets 缺 `AI_API_KEY`（§4.3）；免费项目被暂停（Dashboard 手动 Restore）。
3. DeepSeek 端点下报 400 且提示模型名不对：前端默认模型是 `google/gemini-2.5-flash`——在 `.env` 设 `VITE_AI_MODEL=deepseek-v4-pro` 并重新构建（§5.1），或在 UI「创建 Widget → AI 设置」里选择 DeepSeek。

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
