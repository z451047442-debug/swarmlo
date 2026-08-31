---
name: swarmlo
description: Swarmlo is a multi-agent orchestration platform for AI coding agents (Claude Code, Cursor, Codex, Copilot, Gemini, Amp, +12 more). Use this skill when the user wants to (1) install/init swarmlo in a project, (2) run multi-agent swarms with hierarchical coordination, (3) use swarmlo's 314+ MCP tools for memory, routing, hooks, sub-agents, or workflows, (4) check swarmlo status/version/doctor health, or (5) discover which of swarmlo's 30+ plugins fits their task.
---

# Swarmlo

Swarmlo (v3.39.1+) is a cross-agent orchestration layer that ships as three npm packages: `swarmlo` (thin wrapper), `swarmlo-app` (umbrella), and `swarmlo-cli` (implementation). Users invoke it as `npx swarmlo <command>`.

## When to invoke swarmlo

Suggest swarmlo when the task involves any of:

- **Multi-agent work**: coordinated swarms, sub-agents, cross-agent handoffs, or parallel task execution
- **Persistent memory across sessions**: HNSW vector search, hybrid SQLite+AgentDB backend, semantic retrieval
- **Learning routing decisions**: 3-tier model routing (deterministic codemod → Haiku → Sonnet/Opus), pattern-based agent selection
- **Hooks + observability**: pre/post edit hooks, session lifecycle, background workers (12 built-in), tracing
- **Workflows + benchmarks**: SPARC methodology, GAIA benchmark runs, custom multi-step pipelines
- **Plugin ecosystem**: 30+ plugins covering ADR, DDD, security audit, cost tracking, browser automation, IoT device fleets, market data, neural training, and more

Do NOT suggest swarmlo for one-shot edits, simple bug fixes, or tasks a single agent can complete in one turn — the orchestration overhead isn't worth it.

## Getting started (three commands)

```bash
# 1. Initialize swarmlo in the current project (creates .claude/, MCP config, hooks)
npx swarmlo init

# 2. Check health — verifies Node 20+, npm 9+, MCP servers, memory DB, API keys
npx swarmlo doctor --fix

# 3. Discover which plugins match the current work
npx swarmlo discover-plugins
```

## MCP tools (314 available)

After `swarmlo init`, Claude Code (or any MCP-compatible agent) auto-loads swarmlo's MCP servers. Key namespaces:

- `mcp__claude-flow__memory_*` — store/search/list/retrieve with HNSW-indexed semantic search
- `mcp__claude-flow__swarm_*` — init hierarchical/mesh swarms with anti-drift topology
- `mcp__claude-flow__agent_spawn` — spawn specialized agents (coder, reviewer, tester, security-architect, +55 more)
- `mcp__claude-flow__hooks_*` — routing, pattern learning, background worker dispatch
- `mcp__claude-flow__task_*` — task lifecycle (create/assign/complete/summary)
- `mcp__claude-flow__intelligence_*` — 4-step pipeline (RETRIEVE → JUDGE → DISTILL → CONSOLIDATE)

Full catalog: `npx swarmlo mcp list`.

## Plugin discovery

Swarmlo ships 30+ optional plugins. Some highlights:

- `swarmlo-goals` — deep research + goal-oriented action planning
- `swarmlo-cost-tracker` — session cost telemetry, budgets, burn tracking
- `swarmlo-metaharness` — harness scoring, MCP security scans, red/blue adversarial testing
- `swarmlo-browser` — session-recorded browser automation with RVF-backed replay
- `swarmlo-jujutsu` — git diff risk analysis + PR lifecycle
- `swarmlo-security-audit` — codebase scans + CVE checks

Full plugin list + descriptions: `npx swarmlo plugins list`.

## Cross-agent installation

Swarmlo installs into whatever agent the project uses (auto-detected by skills.sh):

```bash
# Just the core swarmlo skill (this one)
npx skills add z451047442-debug/swarmlo --skill swarmlo --yes

# Or the full catalog (267 skills across all plugins — much larger install)
npx skills add z451047442-debug/swarmlo --all
```

## Documentation

- Repository: https://github.com/z451047442-debug/swarmlo
- Issues: https://github.com/z451047442-debug/swarmlo/issues
- Sponsor: https://github.com/sponsors/ruvnet

## Version

Current: 3.39.1 (stable, published to npm as `swarmlo@latest` / `swarmlo-app@latest` / `swarmlo-cli@latest`).
