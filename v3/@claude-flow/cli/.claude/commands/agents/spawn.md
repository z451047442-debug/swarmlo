---
name: spawn
description: Spawn a new agent with V3 capabilities
type: command
---

# Agent Spawn Command

Spawn a new agent with full V3 capabilities including neural patterns, memory integration, and swarm coordination.

## Usage

```bash
npx swarmlo-cli@latest agent spawn [options]
```

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--type` | `-t` | Agent type to spawn | Required |
| `--name` | `-n` | Agent name/identifier | Auto-generated |
| `--provider` | `-p` | AI provider (anthropic, openrouter, ollama) | anthropic |
| `--model` | `-m` | Model to use | Provider default |
| `--task` | | Initial task for the agent | None |
| `--timeout` | | Agent timeout in seconds | 300 |
| `--auto-tools` | | Enable automatic tool usage | true |

## Agent Types (87 Available)

### Core Development
```bash
npx swarmlo-cli@latest agent spawn -t coder      # Code implementation
npx swarmlo-cli@latest agent spawn -t reviewer   # Code review
npx swarmlo-cli@latest agent spawn -t tester     # Testing
npx swarmlo-cli@latest agent spawn -t planner    # Planning
npx swarmlo-cli@latest agent spawn -t researcher # Research
```

### V3 Specialized
```bash
npx swarmlo-cli@latest agent spawn -t security-architect     # Security design
npx swarmlo-cli@latest agent spawn -t security-auditor       # CVE remediation
npx swarmlo-cli@latest agent spawn -t memory-specialist      # AgentDB (150x-12,500x faster)
npx swarmlo-cli@latest agent spawn -t performance-engineer   # 2.49x-7.47x optimization
npx swarmlo-cli@latest agent spawn -t core-architect         # DDD design
```

### Swarm Coordination
```bash
npx swarmlo-cli@latest agent spawn -t hierarchical-coordinator  # Queen-led
npx swarmlo-cli@latest agent spawn -t mesh-coordinator          # P2P network
npx swarmlo-cli@latest agent spawn -t adaptive-coordinator      # Dynamic topology
npx swarmlo-cli@latest agent spawn -t collective-intelligence-coordinator
```

### Consensus Agents
```bash
npx swarmlo-cli@latest agent spawn -t byzantine-coordinator  # BFT consensus
npx swarmlo-cli@latest agent spawn -t raft-manager          # Leader-based
npx swarmlo-cli@latest agent spawn -t gossip-coordinator    # Eventual consistency
npx swarmlo-cli@latest agent spawn -t crdt-synchronizer     # CRDT replication
npx swarmlo-cli@latest agent spawn -t quorum-manager        # Quorum-based
```

### GitHub Integration
```bash
npx swarmlo-cli@latest agent spawn -t pr-manager           # PR lifecycle
npx swarmlo-cli@latest agent spawn -t code-review-swarm    # Multi-agent review
npx swarmlo-cli@latest agent spawn -t issue-tracker        # Issue management
npx swarmlo-cli@latest agent spawn -t release-manager      # Release coordination
npx swarmlo-cli@latest agent spawn -t workflow-automation  # CI/CD automation
```

### SPARC Methodology
```bash
npx swarmlo-cli@latest agent spawn -t sparc-coordinator    # SPARC orchestration
npx swarmlo-cli@latest agent spawn -t specification        # Requirements
npx swarmlo-cli@latest agent spawn -t pseudocode          # Algorithm design
npx swarmlo-cli@latest agent spawn -t architecture        # System design
npx swarmlo-cli@latest agent spawn -t refinement          # Iterative improvement
```

## Examples

```bash
# Spawn with custom name
npx swarmlo-cli@latest agent spawn -t coder --name feature-bot

# Spawn with initial task
npx swarmlo-cli@latest agent spawn -t researcher --task "Research React 19 features"

# Spawn with specific model
npx swarmlo-cli@latest agent spawn -t architect -m claude-3-opus-20240229

# Spawn with custom timeout
npx swarmlo-cli@latest agent spawn -t tester --timeout 600

# Spawn using OpenRouter
npx swarmlo-cli@latest agent spawn -t coder -p openrouter -m anthropic/claude-3.5-sonnet
```

## Using Claude Code's Task Tool

For actual execution, always use Claude Code's Task tool:

```javascript
// Spawn ALL agents in ONE message for parallel execution
Task("Coder", "Implement authentication feature", "coder")
Task("Tester", "Write unit tests for auth", "tester")
Task("Reviewer", "Review auth implementation", "reviewer")
```

## MCP Coordination (Optional)

Use MCP tools only for swarm coordination setup:

```javascript
mcp__claude-flow__swarm_init({ topology: "hierarchical", maxAgents: 15 })
mcp__claude-flow__agent_spawn({ type: "coordinator", name: "queen" })
```

## Output

```
Spawning coder agent: feature-bot

+-----------+----------------------------------+
| Property  | Value                            |
+-----------+----------------------------------+
| ID        | coder-lx7m9k2                    |
| Type      | coder                            |
| Name      | feature-bot                      |
| Status    | active                           |
| Created   | 2026-01-08T03:30:00.000Z         |
| Capabilities | code, debug, refactor, test   |
+-----------+----------------------------------+

Agent feature-bot spawned successfully
```
