---
name: swarmlo-status
description: Diagnose Swarmlo health, then report system, MCP server, and active-agent status without changing the installation
argument-hint: "[--fix]"
allowed-tools: Bash(npx *)
---

# Swarmlo status

Use this skill when the user asks for Swarmlo health, diagnostics, MCP server
state, or active-agent status.

## Default read-only workflow

Run these commands in order:

```bash
npx swarmlo-cli@3.39.1 doctor
npx swarmlo-cli@3.39.1 status
```

Summarize the diagnostics and status together. Do not repair, reset, start,
stop, install, or otherwise change anything during the default workflow.

## Explicit repair workflow

Only when the user explicitly asks to fix or auto-repair the installation,
replace the first command with:

```bash
npx swarmlo-cli@3.39.1 doctor --fix
npx swarmlo-cli@3.39.1 status
```

Report what the repair changed and the resulting status. Never infer
authorization for `doctor --fix` from a request to check or diagnose Swarmlo.
