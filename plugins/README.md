# Swarmlo Plugins

32 Claude Code plugins for agent-powered development workflows. Load with `--plugin-dir`.

## Quick Start

```bash
# Load specific plugins
claude --plugin-dir plugins/swarmlo-core --plugin-dir plugins/swarmlo-swarm

# Load all plugins
claude $(ls -d plugins/swarmlo-*/ | sed 's|^|--plugin-dir |' | tr '\n' ' ')
```

## Plugin Catalog

### Core & Coordination

| Plugin | Description |
|--------|-------------|
| [swarmlo-core](swarmlo-core/) | MCP server, status, doctor, coder/researcher/reviewer agents |
| [swarmlo-swarm](swarmlo-swarm/) | Swarm topologies (hierarchical, mesh), Monitor streaming |
| [swarmlo-autopilot](swarmlo-autopilot/) | Autonomous /loop task completion with prediction |
| [swarmlo-loop-workers](swarmlo-loop-workers/) | 12 background workers via /loop or CronCreate |
| [swarmlo-workflows](swarmlo-workflows/) | Workflow templates, parallel execution, branching |

### Memory & Intelligence

| Plugin | Description |
|--------|-------------|
| [swarmlo-agentdb](swarmlo-agentdb/) | AgentDB with HNSW vector search (measured ~1.9x-4.7x vs brute force) |
| [swarmlo-rag-memory](swarmlo-rag-memory/) | SOTA RAG — hybrid search, Graph RAG, MMR diversity, memory bridge |
| [swarmlo-rvf](swarmlo-rvf/) | Portable RVF memory format, session persistence |
| [swarmlo-ruvector](swarmlo-ruvector/) | [`ruvector`](https://npmjs.com/package/ruvector) — FlashAttention-3, Graph RAG, hybrid search, 103 MCP tools, Brain AGI |
| [swarmlo-knowledge-graph](swarmlo-knowledge-graph/) | Entity extraction, relation mapping, pathfinder traversal |
| [swarmlo-intelligence](swarmlo-intelligence/) | SONA neural patterns, trajectory learning, model routing |
| [swarmlo-daa](swarmlo-daa/) | Dynamic Agentic Architecture, cognitive patterns |

### Architecture & Methodology

| Plugin | Description |
|--------|-------------|
| [swarmlo-adr](swarmlo-adr/) | ADR lifecycle — create, index, supersede, compliance checking |
| [swarmlo-ddd](swarmlo-ddd/) | DDD scaffolding — bounded contexts, aggregates, domain events |
| [swarmlo-sparc](swarmlo-sparc/) | SPARC methodology with 5 phases and quality gates |

### Quality & Security

| Plugin | Description |
|--------|-------------|
| [swarmlo-security-audit](swarmlo-security-audit/) | CVE scanning, dependency vulnerability checks |
| [swarmlo-aidefence](swarmlo-aidefence/) | Prompt injection detection, PII scanning |
| [swarmlo-testgen](swarmlo-testgen/) | Test gap detection, TDD London School workflow |
| [swarmlo-browser](swarmlo-browser/) | Playwright browser automation and testing |

### Development Tools

| Plugin | Description |
|--------|-------------|
| [swarmlo-jujutsu](swarmlo-jujutsu/) | Diff analysis, risk scoring, reviewer recommendations |
| [swarmlo-docs](swarmlo-docs/) | Doc generation, drift detection, API docs |
| [swarmlo-ruvllm](swarmlo-ruvllm/) | Local LLM inference, MicroLoRA, chat formatting |
| [swarmlo-agent](swarmlo-agent/) | WASM agent sandboxing and gallery |
| [swarmlo-plugin-creator](swarmlo-plugin-creator/) | Scaffold and validate new plugins |
| [swarmlo-migrations](swarmlo-migrations/) | Database schema migration management |
| [swarmlo-observability](swarmlo-observability/) | Structured logging, tracing, metrics correlation |
| [swarmlo-cost-tracker](swarmlo-cost-tracker/) | Token usage tracking, budget alerts, cost optimization |

### Domain-Specific

| Plugin | Description |
|--------|-------------|
| [swarmlo-goals](swarmlo-goals/) | GOAP planning, deep research, horizon tracking |
| [swarmlo-federation](swarmlo-federation/) | Zero-trust cross-installation agent federation |
| [swarmlo-iot-cognitum](swarmlo-iot-cognitum/) | Cognitum Seed IoT — trust scoring, anomaly detection, fleet management |
| [swarmlo-neural-trader](swarmlo-neural-trader/) | [`neural-trader`](https://npmjs.com/package/neural-trader) — 4 agents, LSTM/Transformer, Rust/NAPI backtesting, 112+ MCP tools |
| [swarmlo-market-data](swarmlo-market-data/) | Market data ingestion, OHLCV vectorization, pattern matching |

## Recommended Stacks

| Use Case | Plugins |
|----------|---------|
| Feature development | `swarmlo-core` + `swarmlo-swarm` + `swarmlo-testgen` + `swarmlo-ddd` |
| Security audit | `swarmlo-core` + `swarmlo-security-audit` + `swarmlo-aidefence` |
| Architecture work | `swarmlo-core` + `swarmlo-adr` + `swarmlo-ddd` + `swarmlo-sparc` |
| Deep research | `swarmlo-core` + `swarmlo-goals` + `swarmlo-rag-memory` + `swarmlo-intelligence` |
| Vector search | `swarmlo-core` + `swarmlo-ruvector` + `swarmlo-rag-memory` + `swarmlo-knowledge-graph` |
| IoT development | `swarmlo-core` + `swarmlo-iot-cognitum` + `swarmlo-agentdb` |
| Trading systems | `swarmlo-core` + `swarmlo-neural-trader` + `swarmlo-market-data` + `swarmlo-ruvector` |
| Full stack | All 32 plugins |

## npm Package Integration

Several plugins wrap standalone npm packages for deeper functionality:

| Plugin | npm Package | What It Adds |
|--------|------------|-------------|
| `swarmlo-neural-trader` | [`neural-trader`](https://npmjs.com/package/neural-trader) | 112+ MCP tools, Rust/NAPI engine, LSTM/Transformer models |
| `swarmlo-ruvector` | [`ruvector`](https://npmjs.com/package/ruvector) | 103 MCP tools, FlashAttention-3, Graph RAG, Brain AGI |

```bash
# Install backing packages
npm install neural-trader ruvector

# Add as MCP servers (optional, for direct tool access)
claude mcp add neural-trader -- npx neural-trader mcp start
claude mcp add ruvector -- npx ruvector mcp start
```

## Plugin Structure

Each plugin follows the Claude Code plugin specification:

```
swarmlo-<name>/
  .claude-plugin/plugin.json    # Plugin manifest
  agents/<name>.md              # Agent definitions (frontmatter: name, description, model)
  commands/<name>.md            # CLI command mappings
  skills/<name>/SKILL.md        # Interactive skills (frontmatter: name, description, argument-hint, allowed-tools)
  README.md                     # Plugin documentation
```

## Creating a Plugin

```bash
claude --plugin-dir plugins/swarmlo-plugin-creator
# Then: /create-plugin my-new-plugin
```

Or manually: copy any existing plugin directory and modify.

## Validation

```bash
claude plugin validate plugins/swarmlo-<name>
```

## Verification & Discoverability

Every MCP tool description across the 32 plugins must answer "use this over native (Bash/Read/Grep/Glob/Task/TodoWrite) when?" per [ADR-112](../v3/docs/adr/ADR-112-mcp-tool-discoverability.md). The rule is enforced by CI:

```bash
# Run the audit (scans all MCPTool definitions across all plugins)
node scripts/audit-tool-descriptions.mjs

# Gates: every description must include "Use when …" guidance,
# be ≥ 80 chars, and be unique. Baseline at verification/mcp-tool-baseline.json
# is monotone-decreasing — CI fails on any regression.
```

Combined with [`verification/`](../verification/) (Ed25519-signed witness manifest, 103+ documented fixes attested), the plugin surface is regression-protected at three layers: install smoke (`npm i`), behavioral smoke (paired-tool round-trips), and presence attestation (every load-bearing line of every documented fix). See [`verification/README.md`](../verification/README.md) for the full stack.

## License

MIT
