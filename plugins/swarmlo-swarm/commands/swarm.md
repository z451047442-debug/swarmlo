---
name: swarm
description: Initialize, monitor, and manage multi-agent swarms
---
$ARGUMENTS

Swarm lifecycle management.

**Init**: `npx swarmlo-cli@3.39.1 swarm init --topology hierarchical --max-agents 8 --strategy specialized`
**Status**: `npx swarmlo-cli@3.39.1 swarm status`
**Health**: `npx swarmlo-cli@3.39.1 swarm health`
**Shutdown**: `npx swarmlo-cli@3.39.1 swarm shutdown`

Parse $ARGUMENTS to determine the subcommand. If no arguments, show swarm status.

After init, spawn agents via Claude Code's Task tool with `run_in_background: true` for parallel execution.
