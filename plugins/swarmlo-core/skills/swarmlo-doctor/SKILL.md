---
name: swarmlo-doctor
description: Run health checks on the Swarmlo installation and fix common issues
argument-hint: "[--fix]"
allowed-tools: Bash(npx *)
---
Run `npx swarmlo-cli@latest doctor --fix` to diagnose and auto-repair common issues.

Checks: Node.js 20+, npm 9+, git, config validity, daemon status, memory database, API keys, MCP servers, disk space, TypeScript.

Targeted fixes:
- Memory: `npx swarmlo-cli@latest memory init --force`
- Daemon: `npx swarmlo-cli@latest daemon start`
- Config: `npx swarmlo-cli@latest config reset`
