---
name: discover-plugins
description: Discover and recommend swarmlo plugins based on your workflow, installed MCP tools, and current task
argument-hint: "[search-query]"
allowed-tools: mcp__plugin_swarmlo-core_swarmlo__transfer_plugin-search mcp__plugin_swarmlo-core_swarmlo__transfer_plugin-info mcp__plugin_swarmlo-core_swarmlo__transfer_plugin-featured mcp__plugin_swarmlo-core_swarmlo__transfer_plugin-official mcp__plugin_swarmlo-core_swarmlo__transfer_store-search mcp__plugin_swarmlo-core_swarmlo__transfer_store-featured mcp__plugin_swarmlo-core_swarmlo__transfer_store-trending mcp__plugin_swarmlo-core_swarmlo__transfer_store-info mcp__plugin_swarmlo-core_swarmlo__guidance_discover mcp__plugin_swarmlo-core_swarmlo__guidance_recommend mcp__plugin_swarmlo-core_swarmlo__guidance_capabilities mcp__plugin_swarmlo-core_swarmlo__mcp_status Bash Read
---

# Discover Plugins

Find and recommend swarmlo plugins for your workflow.

## When to use

When starting a new project, exploring swarmlo capabilities, or wondering which plugins would help with your current task.

## Steps

1. **Check installed** — run `ls plugins/` to see what's already installed
2. **Browse marketplace** — call `mcp__plugin_swarmlo-core_swarmlo__transfer_plugin-featured` for recommended plugins
3. **Search by need** — call `mcp__plugin_swarmlo-core_swarmlo__transfer_plugin-search` with keywords matching your task
4. **Get recommendations** — call `mcp__plugin_swarmlo-core_swarmlo__guidance_recommend` with your current task description for personalized suggestions
5. **Check capabilities** — call `mcp__plugin_swarmlo-core_swarmlo__guidance_capabilities` to see what each plugin enables
6. **Show details** — call `mcp__plugin_swarmlo-core_swarmlo__transfer_plugin-info` for full plugin details

## Plugin Catalog (32 plugins)

### Core & Coordination — Start here

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmlo-core** | Always — base layer for all Swarmlo work | MCP server, status, doctor, coder/researcher/reviewer agents |
| **swarmlo-swarm** | Multi-agent tasks (3+ files, features, refactors) | Swarm topologies (hierarchical, mesh), Monitor streaming, worktree isolation |
| **swarmlo-autopilot** | Autonomous task completion without manual steering | /loop-based autonomous execution, progress prediction, learning |
| **swarmlo-loop-workers** | Recurring background work (audits, optimization, mapping) | 12 background workers via /loop or CronCreate scheduling |
| **swarmlo-workflows** | Repeatable multi-step processes | Workflow templates, parallel execution, conditional branching |

### Memory & Intelligence — Cross-session learning

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmlo-agentdb** | Semantic search over code patterns, telemetry, decisions | AgentDB with HNSW vector search (measured ~1.9x-4.7x vs brute force), RuVector embeddings |
| **swarmlo-rag-memory** | Simple key-value memory with search | Store/search/recall without full AgentDB setup |
| **swarmlo-rvf** | Portable memory export/import across machines | RVF format, session persistence, cross-platform transfer |
| **swarmlo-ruvector** | Vector embedding operations, HNSW indexing, clustering | ONNX 384-dim embeddings, hyperbolic Poincare ball, k-means/DBSCAN clustering |
| **swarmlo-knowledge-graph** | Entity extraction, relation mapping, graph traversal | Pathfinder algo on AgentDB causal edges, code entity graphs |
| **swarmlo-intelligence** | Task routing optimization, learning from outcomes | SONA neural patterns, trajectory learning, model routing with confidence |
| **swarmlo-daa** | Self-adapting agents that evolve behavior | Dynamic Agentic Architecture, cognitive patterns, knowledge sharing |

### Architecture & Methodology — Build right

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmlo-adr** | Document architecture decisions, check compliance | ADR create/index/supersede, code-to-ADR linking, compliance checking on diffs |
| **swarmlo-ddd** | Domain modeling, bounded context scaffolding | Context wizard, aggregate roots, domain events, anti-corruption layers, boundary validation |
| **swarmlo-sparc** | Structured development methodology | Specification-Pseudocode-Architecture-Refinement-Completion with quality gates |

### Quality & Security — Ship safely

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmlo-security-audit** | Before merging, after dependency changes | CVE scanning, dependency vulnerability checks, security reports |
| **swarmlo-aidefence** | Processing user input, handling untrusted data | Prompt injection detection, PII scanning, adversarial defense |
| **swarmlo-testgen** | After implementing features, during refactors | Test gap detection, TDD London School workflow, coverage routing |
| **swarmlo-browser** | UI testing, web scraping, visual validation | Playwright automation — navigate, click, screenshot, validate |

### Development Tools — Build faster

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmlo-jujutsu** | PR review, merge decisions, diff risk scoring | Diff analysis, risk classification, reviewer recommendations |
| **swarmlo-docs** | After API changes, before releases | Doc generation, drift detection, API documentation |
| **swarmlo-ruvllm** | Local LLM inference, custom model configs | RuVLLM integration, MicroLoRA fine-tuning, chat formatting |
| **swarmlo-agent** | Sandboxed code execution, untrusted workloads | WASM agent sandboxing, community gallery |
| **swarmlo-plugin-creator** | Building new swarmlo plugins | Scaffold structure, validate frontmatter, test MCP references |
| **swarmlo-migrations** | Database schema changes | Sequential migration numbering, up/down pairs, dry-run, rollback validation |
| **swarmlo-observability** | Logging, tracing, metrics correlation | Structured JSON logging, distributed tracing, agent-to-app telemetry correlation |
| **swarmlo-cost-tracker** | Token budget management | Per-agent cost attribution, model pricing, budget alerts, optimization recommendations |

### Domain-Specific — Specialized workloads

| Plugin | When to use | What it adds |
|--------|-------------|-------------|
| **swarmlo-goals** | Long-horizon planning, multi-session research | GOAP algorithm, deep research orchestration, horizon tracking, synthesis |
| **swarmlo-federation** | Cross-installation agent coordination | Zero-trust peer discovery, mTLS auth, consensus routing, compliance audit |
| **swarmlo-iot-cognitum** | Cognitum Seed hardware device management | 5-tier device trust, telemetry anomaly detection (Z-score), fleet firmware rollouts, witness chain verification, SONA + AgentDB integration |
| **swarmlo-neural-trader** | Trading strategy development and backtesting | Z-score market anomalies, SONA trajectory strategies, walk-forward backtesting, portfolio optimization |
| **swarmlo-market-data** | Market data ingestion and pattern matching | OHLCV vectorization, candlestick pattern detection, HNSW-indexed historical search |

## Decision Guide

**"I need to..."** → Use this plugin:

- Build a feature → `swarmlo-core` + `swarmlo-swarm` + `swarmlo-testgen`
- Fix a bug → `swarmlo-core` + `swarmlo-jujutsu` (for diff analysis)
- Audit security → `swarmlo-security-audit` + `swarmlo-aidefence`
- Run background tasks → `swarmlo-loop-workers` + `swarmlo-autopilot`
- Search past decisions → `swarmlo-agentdb` + `swarmlo-rag-memory`
- Plan a multi-week effort → `swarmlo-goals` (horizon tracking)
- Manage IoT devices → `swarmlo-iot-cognitum`
- Coordinate remote agents → `swarmlo-federation`
- Test UI changes → `swarmlo-browser`
- Generate docs → `swarmlo-docs`
- Create a new plugin → `swarmlo-plugin-creator`
- Document architecture decisions → `swarmlo-adr`
- Scaffold domain models → `swarmlo-ddd`
- Follow SPARC methodology → `swarmlo-sparc`
- Develop trading strategies → `swarmlo-neural-trader` + `swarmlo-market-data`
- Work with vector embeddings → `swarmlo-ruvector`
- Build knowledge graphs → `swarmlo-knowledge-graph`
- Manage database migrations → `swarmlo-migrations`
- Add observability → `swarmlo-observability`
- Track token costs → `swarmlo-cost-tracker`

## Install any plugin

```
/plugin marketplace add github.com/z451047442-debug/swarmlo
/plugin install <plugin-name>@swarmlo
```
