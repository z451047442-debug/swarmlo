---
layout: default
title: Swarmlo Marketplace
description: Claude Code native agents, swarms, workers, and MCP tools for continuous software engineering
---

# Swarmlo Marketplace

**Installable agentic workflows for Claude Code -- not just commands.**

Swarmlo provides native Claude Code plugins for multi-agent orchestration, /loop workers, security auditing, memory-powered RAG, and test generation.

## Quick Install

```bash
# Add the marketplace
/plugin marketplace add z451047442-debug/swarmlo

# Install plugins
/plugin install swarmlo-core@swarmlo
/plugin install swarmlo-swarm@swarmlo
/plugin install swarmlo-loop-workers@swarmlo
```

## Plugins

| Plugin | Description | Install |
|--------|-------------|---------|
| **swarmlo-core** | MCP server, base commands, project config | `/plugin install swarmlo-core@swarmlo` |
| **swarmlo-swarm** | Teams, agents, Monitor streams, worktree isolation | `/plugin install swarmlo-swarm@swarmlo` |
| **swarmlo-loop-workers** | /loop workers, CronCreate, cache-aware scheduling | `/plugin install swarmlo-loop-workers@swarmlo` |
| **swarmlo-security-audit** | Security review, dependency checks, policy gates | `/plugin install swarmlo-security-audit@swarmlo` |
| **swarmlo-rag-memory** | RuVector memory, HNSW search, AgentDB | `/plugin install swarmlo-rag-memory@swarmlo` |
| **swarmlo-testgen** | Test gap detection, coverage analysis, TDD workflow | `/plugin install swarmlo-testgen@swarmlo` |
| **swarmlo-docs** | Doc generation, drift detection, API docs | `/plugin install swarmlo-docs@swarmlo` |
| **swarmlo-autopilot** | Autonomous /loop completion, learning, prediction | `/plugin install swarmlo-autopilot@swarmlo` |
| **swarmlo-intelligence** | Self-learning SONA patterns, trajectory learning, routing | `/plugin install swarmlo-intelligence@swarmlo` |
| **swarmlo-agentdb** | AgentDB controllers, HNSW vector search, RuVector | `/plugin install swarmlo-agentdb@swarmlo` |
| **swarmlo-aidefence** | AI safety scanning, PII detection, prompt defense | `/plugin install swarmlo-aidefence@swarmlo` |
| **swarmlo-browser** | Playwright browser automation, testing, scraping | `/plugin install swarmlo-browser@swarmlo` |
| **swarmlo-jujutsu** | Git diff analysis, risk scoring, reviewer recs | `/plugin install swarmlo-jujutsu@swarmlo` |
| **swarmlo-agent** | Sandboxed WASM agents and gallery sharing | `/plugin install swarmlo-agent@swarmlo` |
| **swarmlo-workflows** | Workflow templates, orchestration, lifecycle | `/plugin install swarmlo-workflows@swarmlo` |
| **swarmlo-daa** | Dynamic Agentic Architecture, cognitive patterns | `/plugin install swarmlo-daa@swarmlo` |
| **swarmlo-ruvllm** | Local LLM inference, MicroLoRA, chat formatting | `/plugin install swarmlo-ruvllm@swarmlo` |
| **swarmlo-rvf** | RVF portable memory, session persistence | `/plugin install swarmlo-rvf@swarmlo` |
| **swarmlo-plugin-creator** | Scaffold, validate, publish new plugins | `/plugin install swarmlo-plugin-creator@swarmlo` |

## How It Works

Swarmlo plugins extend Claude Code with:
- **Skills** -- Teach Claude Code new workflows (swarm init, /loop workers, security scans)
- **Commands** -- Slash commands for common operations (/status, /audit, /memory)
- **Agents** -- Specialized agent definitions (coder, reviewer, architect, security-auditor)
- **MCP Server** -- 314 tools for coordination, memory, neural learning, and more

## Claude Code Native Integration

Swarmlo plugins use Claude Code's native capabilities when available:

| Feature | Plugin | Claude Code Native |
|---------|--------|--------------------|
| Periodic workers | swarmlo-loop-workers | `/loop` + `ScheduleWakeup` |
| Live monitoring | swarmlo-swarm | `Monitor` tool |
| Background jobs | swarmlo-loop-workers | `CronCreate` |
| Agent isolation | swarmlo-swarm | `isolation: "worktree"` |
| Multi-agent comms | swarmlo-swarm | `TeamCreate` + `SendMessage` |
| Cross-session | swarmlo-core | `PushNotification` + `RemoteTrigger` |
| Autonomous loops | swarmlo-autopilot | `/loop` + `ScheduleWakeup` + autopilot MCP |

## Trust & Security

- All plugins are open source -- review before installing
- MCP servers run locally, no data leaves your machine
- Plugins declare required permissions in their manifest
- Pin versions for production use: `/plugin install swarmlo-core@0.1.0@swarmlo`
- Security scanning available via swarmlo-security-audit
- Cryptographically-signed [witness manifest](../verification.md) attests every documented fix; see [Validation System](validation/) for the three-layer regression-protection stack

## Links

- [GitHub Repository](https://github.com/z451047442-debug/swarmlo)
- [npm Packages](https://www.npmjs.com/package/@claude-flow/cli)
- [ADR-091: Native Integration](https://github.com/z451047442-debug/swarmlo/blob/main/v3/docs/adr/ADR-091-loop-monitor-native-integration.md)
- [Issues & Support](https://github.com/z451047442-debug/swarmlo/issues)
