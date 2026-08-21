# Swarmlo Research（goal.ruv.io）部署指南

> 本文面向自托管与生产部署，覆盖 Windows 与 Linux 两条路径。
> 托管演示：[goal.ruv.io](https://goal.ruv.io/)（目标规划）· [goal.ruv.io/agents](https://goal.ruv.io/agents)（实时智能体仪表盘）。
> 源码：`v3/goal_ui/`。技术栈：React 18 · TypeScript 5 · Vite 5 · Tailwind 3 · Supabase（Postgres + Auth + Edge Functions）· GOAP A* 规划器。

## 0. 部署架构速览

本项目是**前端与后端分离**的两段式部署，缺一不可：

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

- **前端部署**：Netlify（本文 §4）；任何能托管静态文件的平台（Vercel / Cloudflare Pages / Nginx）同理。
- **后端部署**：Supabase Edge Functions（本文 §3）。
- 托管演示 goal.ruv.io 即按本文流程部署：Netlify + 自定义域名 + Supabase 托管后端。

---

## 1. 前置条件

### 1.1 通用要求

| 依赖 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | **18+**（Netlify 构建需 `NODE_VERSION=18` 或更高） | 本地开发 / 构建 |
| npm | 9+（随 Node 附带） | 依赖安装 |
| Git | 任意近期版本 | 克隆仓库 / Netlify Git 集成 |
| Supabase CLI | 1.150+（**仅部署 Edge Functions 时需要**） | 登录、关联项目、函数部署 |
| Netlify CLI | 任意近期版本（可选，CLI 手动部署时需要） | `netlify deploy` |

> 只做本地开发的话，Node.js + Git 就够了；Supabase 后端可以直接连托管演示的云端项目（配置见 §3.4，需要你有该项目的 publishable key）。

### 1.2 Windows 安装

```powershell
# 方式一：官网 MSI 安装包（推荐，含 npm）
#   Node.js LTS：https://nodejs.org/  → 一路下一步

# 方式二：winget（PowerShell 管理员）
winget install OpenJS.NodeJS.LTS
winget install Git.Git          # ⚠ 必须装 Git for Windows——见下方"cp 坑"

# CLI 工具（全局安装，按需）
npm install -g supabase
npm install -g netlify-cli
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

# CLI 工具（全局安装，按需）
npm install -g supabase
npm install -g netlify-cli
```

---

## 2. 本地运行

```bash
# Windows：在 Git Bash 中执行；Linux：直接执行
git clone https://github.com/z451047442-debug/swarmlo
cd swarmlo/v3/goal_ui
npm install
```

配置环境变量（§3.4 有详细说明）：

```bash
# Windows（PowerShell）
Copy-Item example.env .env     # 然后编辑 .env

# Windows（Git Bash）/ Linux
cp example.env .env            # 然后编辑 .env
```

```bash
npm run dev
# → http://localhost:8080        （端口定义在 vite.config.ts）
# → http://localhost:8080/agents （智能体仪表盘）
```

Widget 开发模式（产出 `dist/widget.js` + `dist/widget.css`，并复制进 `public/`）：

```bash
npm run widget:dev
```

生产构建与本地预览：

```bash
npm run build                  # widget 构建 → 主应用构建 → 产物归位到 dist/
npm run preview                # → http://localhost:4173（含 /demo 演示页）
```

> 本地不部署 Supabase 时，主页面会在调用 Edge Functions 时报错——属正常现象；
> 连接云端 Supabase 项目（§3.4）后即可全功能运行。

---

## 3. Supabase 后端配置（Edge Functions）

### 3.1 创建 Supabase 项目

1. 打开 [supabase.com/dashboard](https://supabase.com/dashboard)，Sign in 后 **New project**。
2. 记下关键信息：
   - **Project ID / Reference**（如 `abcdefghijklm`）→ 对应 `VITE_SUPABASE_PROJECT_ID`
   - **Project URL**（如 `https://abcdefghijklm.supabase.co`）→ 对应 `VITE_SUPABASE_URL`
3. 免费层即可跑通全部 5 个函数（注意免费项目闲置 7 天会暂停，需要去 Dashboard 手动恢复）。

### 3.2 登录与关联项目（Windows / Linux 命令一致）

```bash
supabase login                 # 浏览器完成 OAuth 授权

# 在 v3/goal_ui 目录内关联你的云项目（supabase/config.toml 已存在，无需 init）
supabase link --project-ref <你的-project-id>
```

### 3.3 部署 5 个 Edge Functions

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

### 3.4 前端环境变量（随 Vite 构建注入）

复制 `example.env` → `.env`，填三个值（**全部为客户端可公开的 publishable 变量**）：

```env
VITE_SUPABASE_URL=https://<你的-project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
VITE_SUPABASE_PROJECT_ID=<你的-project-id>
```

取值位置：Supabase Dashboard → **Project Settings → API Keys**：
- Project URL → `VITE_SUPABASE_URL`
- **Publishable key**（以 `sb_publishable_` 开头）→ `VITE_SUPABASE_PUBLISHABLE_KEY`

> ⚠ 不要用 `anon` key 或 `service_role` key 填 `VITE_SUPABASE_PUBLISHABLE_KEY`：
> 前端代码（`src/integrations/supabase/client.ts`）明确读取 publishable key，
> 且 `service_role` key 会绕过行级安全策略，**绝不能**出现在浏览器代码里。
> 旧版文档中 `VITE_SUPABASE_ANON_KEY` 的说法已过时，以 `example.env` 为准。

### 3.5 Edge Functions 服务端 Secrets

函数内部需要 Supabase 服务端凭据时（如 `SUPABASE_SERVICE_ROLE_KEY`），**不要**放在前端 `.env`：

1. Dashboard → **Edge Functions → Secrets** → Add secret。
2. 填入函数实际读取的 key（参考 `example.env` 注释段：`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` 等）。
3. Secrets 在函数运行时通过环境变量注入，重新部署函数后生效。

---

## 4. Netlify 部署（前端）

仓库内的 `netlify.toml` 已配好全部规则，无需额外配置：

| 配置项 | 值 | 说明 |
|--------|----|------|
| Build command | `npm run build` | widget → 主应用 → 产物归位 dist/ |
| Publish directory | `dist` | Vite 构建产物 |
| SPA 回退 | `/* → /index.html`（200） | 支持 `/agents` 等客户端路由直链 |
| CORS 头 | `/widget.js`、`/widget.css` | 供第三方站点跨域嵌入 |
| 缓存 | `/assets/*` 1 年 immutable | 静态资源长缓存 |

### 4.1 方式 A：Git 集成自动部署（推荐）

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**，连接 GitHub，选中 `z451047442-debug/swarmlo`。
2. **Base directory** 设为 `v3/goal_ui`。
3. Build settings 会自动读取 `netlify.toml`；在 Environment variables 中确认 `NODE_VERSION=18`（或更高）。
4. Deploy。此后每次 push 自动构建发布。

### 4.2 方式 B：CLI 手动部署（Windows / Linux 命令一致）

```bash
# 在 v3/goal_ui 目录内（Windows 记得在 Git Bash 里执行）
npm run build

# 首次：登录并初始化站点（交互式选择 team / 站点名）
netlify login
netlify init

# 生产部署（也可用 netlify deploy 发 preview 链接先验证）
netlify deploy --prod --dir=dist
```

### 4.3 环境变量配置（Netlify 侧）

Netlify 站点 → **Site configuration → Environment variables**，添加 §3.4 中的三个 `VITE_*` 变量。
由于是构建时注入，**修改后必须重新触发一次部署**（Retry deploy 即可）才会生效。

### 4.4 自定义域名

1. 站点 → **Domain settings → Add a domain**，输入你的域名（托管演示即 `goal.ruv.io`）。
2. 按提示到你的 DNS 服务商添加记录：
   - 裸域名：`A` 记录指向 Netlify 负载均衡地址，或 `ALIAS`/`ANAME`（取决于服务商）
   - 子域名（推荐，如 `goal.example.com`）：`CNAME` 指向 `apex-loadbalancer.netlify.com`
3. 等待 DNS 生效，Netlify 自动签发 Let's Encrypt 证书并启用 HTTPS。

---

## 5. Windows / Linux 差异速查

| 场景 | Windows | Linux |
|------|---------|-------|
| 执行 npm 命令 | **在 Git Bash 里执行**（npm 脚本含 `cp`） | 任意 shell |
| 复制 .env | `Copy-Item example.env .env`（PowerShell）或 `cp`（Git Bash） | `cp example.env .env` |
| 多行环境变量 | PowerShell 用反引号 `` ` `` 续行 | bash 用 `\` 续行 |
| Node 安装 | 官网 MSI / `winget install OpenJS.NodeJS.LTS` | `nvm install 20` |
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

1. `.env` 或 Netlify 环境变量缺失 → 检查三个 `VITE_*` 是否齐全。
2. key 类型错误 → 必须是 **publishable key**（`sb_publishable_` 前缀），见 §3.4。
3. 改了 Netlify 环境变量但没重新部署 → 构建时注入，需 Retry deploy。

### 6.6 Edge Function 调用返回 500

1. 函数未部署：`supabase functions list` 确认 5 个函数 ACTIVE。
2. Secrets 未配置：Dashboard → Edge Functions → Secrets 补齐服务端 key。
3. 免费项目被暂停：Dashboard 检查项目状态，手动 Restore。

### 6.7 本地 dev 能跑但生产空白

生产走 `npm run build`（含 widget 构建步骤），dev 走 `vite dev`——两者产物不同。
务必用 `npm run build && npm run preview` 验证生产产物后再部署。

---

## 7. 环境变量参考

| 变量 | 位置 | 必填 | 说明 |
|------|------|:----:|------|
| `VITE_SUPABASE_URL` | 前端 `.env` / Netlify | ✅ | Supabase 项目 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 前端 `.env` / Netlify | ✅ | 浏览器可公开的 publishable key |
| `VITE_SUPABASE_PROJECT_ID` | 前端 `.env` / Netlify | ✅ | Supabase Project Reference |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 等 | **仅** Edge Functions Secrets | 按需 | 服务端凭据，禁止进前端 |

## 8. Widget 嵌入（部署后可用）

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
